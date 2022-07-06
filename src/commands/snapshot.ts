import fs from 'fs'
import path from 'path'
import { prompts } from 'prompts'
import { ArgumentsCamelCase } from 'yargs'

import type { CompilerSettings } from '../types'
import { checkAccessToken, getProjects, submitSnapshot } from '../api.service'
import { TRAKON_UI_BASE } from '../api.constants'
import env from '../env'

const REQUIRED_SOLC_STANDARD_JSON_FIELDS = [
  'solcVersion',
  'solcLongVersion',
  'input',
  'output',
]

const REQUIRED_TRUFFLE_OUTPUT_JSON_FIELDS = [
  'metadata',
  'bytecode',
  'sourcePath',
]

const validateTruffleOutputJson = (content: any) => {
  return !REQUIRED_TRUFFLE_OUTPUT_JSON_FIELDS.find((k) => !(k in content))
}

const validateSolcStandardJson = (content: any) => {
  return !REQUIRED_SOLC_STANDARD_JSON_FIELDS.find((k) => !(k in content))
}

const parseTruffleArtifactJson = (content: {
  metadata: string
  source: string
  ast: { absolutePath: string }
}) => {
  const metadata: {
    settings: CompilerSettings
    compiler: { version: string }
  } = JSON.parse(content.metadata)
  const projectPrefix = 'project:'
  let contractPath = content.ast.absolutePath
  if (contractPath.startsWith(projectPrefix)) {
    contractPath = contractPath.slice(projectPrefix.length)
  }
  const sources = { [contractPath]: { content: content.source } }
  const { optimizer, evmVersion } = metadata.settings
  return {
    solcLongVersion: metadata.compiler.version,
    sources,
    settings: { optimizer, evmVersion },
  }
}

const parseSolcStandardArtifactJson = (artifact: {
  solcLongVersion: string
  input: {
    sources: { [key: string]: { content: string } }
    settings: CompilerSettings
  }
}) => {
  return {
    solcLongVersion: artifact.solcLongVersion,
    sources: artifact.input.sources,
    settings: artifact.input.settings,
  }
}

const promptConfirmSnapshot = async (scanResult: {
  sources: { [key: string]: {} }
  settings: {}
}) => {
  const contractNames = Object.keys(scanResult.sources)
    .sort()
    .map((name) => `\t${name}`)
    .join(',\n')

  // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
  return prompts.confirm({
    type: 'confirm',
    name: 'Confirm contracts',
    message: `We found the following contracts and dependencies:\n${contractNames}\n\nConfirm snapshot to ${TRAKON_UI_BASE}`,
  }) as unknown as Promise<string | undefined>
}

const scanPathForArtifacts = (
  filePath: string,
): {
  solcLongVersion: string
  sources: { [key: string]: { content: string } }
  settings: CompilerSettings
} => {
  const isDirectory = fs.lstatSync(filePath).isDirectory()
  if (isDirectory) {
    const directoryResult = fs
      .readdirSync(filePath)
      .map((file) => {
        const fullPath = path.join(filePath, file)
        return {
          path: fullPath,
          time: fs.lstatSync(fullPath).mtimeMs,
        }
      })
      // Sort in descending order.
      .sort((a, b) => b.time - a.time)
      .reduce<{
        solcLongVersion: string
        sources: { [key: string]: { content: string } }
        settings: CompilerSettings
      }>((acc, fileInfo) => {
        if (fileInfo.path.startsWith('.') || fileInfo.path === 'node_modules') {
          return acc
        }
        const pathResult = scanPathForArtifacts(fileInfo.path)
        const completeResult = {
          solcLongVersion: acc.solcLongVersion || pathResult.solcLongVersion,
          sources: {
            ...pathResult.sources,
            ...acc.sources,
          },
          settings: { ...pathResult.settings, ...acc.settings },
        }
        return completeResult
      }, <{ solcLongVersion: string; sources: { [key: string]: { content: string } }; settings: CompilerSettings }>{})
    return directoryResult
  }

  if (!filePath.endsWith('.json')) {
    return {
      solcLongVersion: '',
      sources: {},
      settings: {},
    }
  }

  const contents = fs.readFileSync(filePath, 'utf8')
  let parsedContent
  try {
    parsedContent = JSON.parse(contents)
  } catch (e) {
    // unparseable json file
    if (env.VERBOSE) {
      console.warn('Could not parse json file:', filePath)
    }
    return {
      solcLongVersion: '',
      sources: {},
      settings: {},
    }
  }

  if (typeof parsedContent !== 'object') {
    if (env.VERBOSE) {
      console.warn('Invalid json content in file:', filePath)
    }
    return {
      solcLongVersion: '',
      sources: {},
      settings: {},
    }
  }
  const validSolcStandardJson = validateSolcStandardJson(parsedContent)
  if (!validSolcStandardJson) {
    // json file did not match a solc "standard json" format.
    // Let's test it against a truffle json output.

    const validTruffleOutputJson = validateTruffleOutputJson(parsedContent)
    if (!validTruffleOutputJson) {
      return {
        solcLongVersion: '',
        sources: {},
        settings: {},
      }
    }
    return parseTruffleArtifactJson(parsedContent)
  }

  return parseSolcStandardArtifactJson(parsedContent)
}

export const buildCompilerInput = (
  sources: { [key: string]: { content: string } },
  settings: CompilerSettings,
) => {
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      ...settings,
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'metadata'],
        },
      },
    },
  }
  return input
}

type CompilerInput = ReturnType<typeof buildCompilerInput>

export const recompileStandard = async (
  solcLongVersion: string,
  input: CompilerInput,
) => {
  const loadVersion = `v${solcLongVersion}`
  // Lazy load solc due to performance.
  const solc = require('solc')
  return new Promise(
    (resolve, reject) =>
      void solc.loadRemoteVersion(loadVersion, (err: any, compiler: any) => {
        if (err) {
          reject(err)
        } else {
          const compilationResult = compiler.compile(JSON.stringify(input))
          const output = JSON.parse(compilationResult)
          resolve({
            solcVersion: solcLongVersion.split('+')[0],
            solcLongVersion,
            output,
            input,
          })
        }
      }),
  )
}

export const snapshot = async (
  command: ArgumentsCamelCase<{
    path: string
    projectId?: string
    apiKey?: string
  }>,
) => {
  if (!env.API_KEY) {
    console.error(
      'Requires an API key. Head to https://trakon.xyz to generate one.',
    )
    return
  }

  try {
    await checkAccessToken()
  } catch (e) {
    console.error('Your API key is not valid.')
    return
  }

  let projectId = command.projectId
  if (!projectId) {
    let projectsResponse = await getProjects({ limit: 25, offset: 0 })
    if (projectsResponse.projects?.length || 0 > 0) {
      projectId = await (prompts.select({
        type: 'select',
        name: 'Select project',
        message: 'Choose an existing project or create a new one',
        choices: [
          { title: 'Create new project', value: '' },
          ...(projectsResponse.projects?.map((project) => ({
            title: project.name
              ? `${project.name} (${project.slug})`
              : project.slug,
            value: project.slug,
          })) ?? []),
        ],
        initial: 0,
      }) as unknown as Promise<string>)
    }
  }

  const scanResult = scanPathForArtifacts(
    path.join(process.cwd(), command.path),
  )
  const numSourcesFound = Object.keys(scanResult.sources).length
  if (numSourcesFound < 1) {
    console.warn('No Solidity compilation files found.')
    return
  }

  const isConfirmed = await promptConfirmSnapshot(scanResult)
  if (!isConfirmed) {
    return
  }

  const { solcLongVersion, sources, settings } = scanResult

  console.info(`Compiling contracts with version: ${solcLongVersion}`)
  const compilerInput = buildCompilerInput(sources, settings)
  const compilationResult = (await recompileStandard(
    solcLongVersion,
    compilerInput,
  )) as { input: {}; output: { errors?: [] } }
  if (
    compilationResult.output.errors &&
    compilationResult.output.errors.length > 0
  ) {
    console.error(
      'Error compiling contracts:',
      JSON.stringify(compilationResult.output.errors, null, 4),
    )
  }
  console.info('Contracts compiled.')

  console.info('Uploading snapshot...')
  try {
    const snapshotResult = await submitSnapshot(compilationResult, projectId)
    console.info(
      `Snapshot complete! To see your project, visit ${snapshotResult.url}`,
    )
  } catch (err: any) {
    console.error(
      'There was an error uploading the snapshot.',
      env.VERBOSE ? JSON.stringify(err.response.data.errors, null, 2) : '',
    )
    return
  }
}
