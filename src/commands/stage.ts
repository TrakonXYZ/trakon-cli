import fs from 'fs'
import path from 'path'
import { prompts } from 'prompts'
import solc from 'solc'
import type yargs from 'yargs'

import type { CompilerSettings } from '../types'
import { submitStaging } from '../api.service'
import { ZEPHERUS_UI_BASE } from '../api.constants'

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

const CONTRACT_NAME_PREVIEW_LIMIT = 3

enum ContractOutputType {
  STANDARD = 'STANDARD',
  TRUFFLE = 'TRUFFLE',
}

const validateTruffleOutputJson = (contents: any) => {
  if (REQUIRED_TRUFFLE_OUTPUT_JSON_FIELDS.find((k) => !(k in contents))) {
    return false
  }

  // eslint-disable-next-line sonarjs/prefer-single-boolean-return
  if (contents.bytecode === '0x') {
    // target does not produce bytecode (abstract or interface?) and should be skipped...
    return false
  }

  return true
}

const validateSolcStandardJson = (contents: any) => {
  // eslint-disable-next-line sonarjs/prefer-single-boolean-return
  if (REQUIRED_SOLC_STANDARD_JSON_FIELDS.find((k) => !(k in contents))) {
    return false
  }

  return true
}

const parseContractNamesFromTruffleJsonOutput = (contents: {
  metadata: string
}) => {
  const metadata: {
    sources: { [key: string]: {} }
    settings: { compilationTarget: { [key: string]: string } }
  } = JSON.parse(contents.metadata)
  return Object.keys(metadata.sources)
    .filter((source) => source in metadata.settings.compilationTarget)
    .map((source: string) => {
      // e.g. 'project:/contracts/Ownable.sol'
      // console.debug('source:', source)
      if (!source.startsWith('project:/')) {
        throw new Error('Unexpected JSON structure.')
      }
      return metadata.settings.compilationTarget[source]
    }, [])
}

const parseContractNamesFromSolcStandardJsonOutput = (output: {
  contracts: { [key: string]: {} }
}) => {
  return Object.keys(output.contracts).reduce<string[]>((acc, filename) => {
    return acc.concat(Object.keys(output.contracts[filename]))
  }, [])
}

const promptContractChoice = async (scanResult: {
  [key: string]: { contracts: string[]; outputType: ContractOutputType }
}) => {
  const choices = Object.keys(scanResult).map((filepath) => {
    const relativePath = filepath.slice(process.cwd().length + 1)
    const totalContracts = scanResult[filepath].contracts.length
    const overflowCount = totalContracts - CONTRACT_NAME_PREVIEW_LIMIT
    return {
      title: `${relativePath} (${scanResult[filepath].contracts
        .slice(0, CONTRACT_NAME_PREVIEW_LIMIT)
        .join(', ')}${
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        overflowCount > 0 ? ' and ' + overflowCount + ' more' : ''
      })`,
      value: filepath,
    }
  })
  console.log('choices:', choices)
  // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
  return prompts.select({
    type: 'select',
    name: 'Select Contract',
    message: `We found the following contracts. Choose one to be staged at ${ZEPHERUS_UI_BASE}`,
    choices,
    initial: 0,
  }) as unknown as Promise<string | undefined>
}

const scanPath = (
  filePath: string,
): {
  [key: string]: { contracts: string[]; outputType: ContractOutputType }
} => {
  const isDirectory = fs.lstatSync(filePath).isDirectory()
  if (isDirectory) {
    const directoryResult = fs.readdirSync(filePath).reduce((acc, file) => {
      const fullPath = path.join(filePath, file)
      if (file.startsWith('.') || file === 'node_modules') {
        return acc
      }
      const pathResult = scanPath(fullPath)
      const completeResult = {
        ...acc,
        ...pathResult,
      }
      return completeResult
    }, {})
    return directoryResult
  }

  // non json file
  if (!filePath.endsWith('.json')) {
    return {}
  }

  const contents = fs.readFileSync(filePath, 'utf8')
  let parsedContent
  try {
    parsedContent = JSON.parse(contents)
  } catch (e) {
    // unparseable json file
    console.warn('Could not parse json file:', filePath)
    return {}
  }

  // console.debug('Validating file:', filePath)
  if (typeof parsedContent !== 'object') {
    console.error('Invalid json content in file:', filePath)
    return {}
  }
  const validSolcStandardJson = validateSolcStandardJson(parsedContent)
  if (!validSolcStandardJson) {
    // json file did not match a solc "standard json" format.
    // Let's test it against a truffle json output.

    const validTruffleOutputJson = validateTruffleOutputJson(parsedContent)
    if (!validTruffleOutputJson) {
      return {}
    }
    return {
      [filePath]: {
        outputType: ContractOutputType.TRUFFLE,
        contracts: parseContractNamesFromTruffleJsonOutput(
          parsedContent as { metadata: string },
        ),
      },
    }
  }

  return {
    [filePath]: {
      outputType: ContractOutputType.STANDARD,
      contracts: parseContractNamesFromSolcStandardJsonOutput(
        parsedContent.output as { contracts: { [key: string]: string } },
      ),
    },
  }
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
  console.log('Loading solc verison: "%s"', loadVersion)
  return new Promise(
    (resolve, reject) =>
      void solc.loadRemoteVersion(loadVersion, (err, compiler) => {
        if (err) {
          reject(err)
        } else {
          const compilationResult = compiler.compile(JSON.stringify(input))
          const output = JSON.parse(compilationResult)
          // console.log('output:', Object.keys(output), JSON.stringify(output))
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

export const findTruffleProjectRoot = (sourcePath: string): string => {
  const configFileExsits = fs.existsSync(
    path.join(sourcePath, 'truffle-config.js'),
  )
  if (!configFileExsits) {
    return findTruffleProjectRoot(path.join(sourcePath, '..'))
  }
  return sourcePath
}

export const buildTruffleInput = (parsedContent: {
  sourcePath: string
  metadata: string
}) => {
  if (!validateTruffleOutputJson(parsedContent)) {
    throw new Error('Validation of truffle output json failed.')
  }
  const truffleProjectRoot = findTruffleProjectRoot(parsedContent.sourcePath)
  const metadata: { sources: { [key: string]: { content: string } } } =
    JSON.parse(parsedContent.metadata)
  return buildCompilerInput(
    Object.keys(metadata.sources).reduce<{
      [key: string]: { content: string }
    }>((acc, next) => {
      const part = 'project:/'
      // next: e.g. project:/contracts/Ownable.sol
      acc[next.slice(part.length)] = {
        content: fs.readFileSync(
          path.join(truffleProjectRoot, next.slice(part.length)),
          'utf8',
        ),
      }
      return acc
    }, {}),
    {
      // compilationTarget: { 'project:/contracts/SampleContract.sol': 'SampleContract' },
      evmVersion: 'london',
      // libraries: {},
      // metadata: { bytecodeHash: 'ipfs' },
      optimizer: { enabled: false, runs: 200 },
      // remappings: [],
      // outputSelection: { '*': [Object] }
    },
  )
}

export const stage = async (
  command: yargs.ArgumentsCamelCase<{ path: string }>,
) => {
  const scanResult = scanPath(path.join(process.cwd(), command.path))
  const choicesCount = Object.keys(scanResult).length
  if (choicesCount < 1) {
    console.warn('No Solidity compilation files found.')
    return
  }
  console.debug('scanResult:', scanResult)
  const choice = await promptContractChoice(scanResult)

  if (choice) {
    // console.debug('choice:', choice, scanResult[choice])
    const contents = fs.readFileSync(choice, 'utf8')
    const parsedContent: {
      metadata: string
      solcLongVersion: string
      input: { settings: any; sources: any }
    } = JSON.parse(contents)

    const projectType = scanResult[choice].outputType

    if (
      projectType === ContractOutputType.STANDARD &&
      !validateSolcStandardJson(parsedContent)
    ) {
      throw new Error('Validation of solc standard json failed.')
    }

    if (
      projectType === ContractOutputType.TRUFFLE &&
      !validateTruffleOutputJson(parsedContent)
    ) {
      throw new Error('Validation of truffle json failed.')
    }

    const solcLongVersion: string =
      projectType === ContractOutputType.STANDARD
        ? parsedContent.solcLongVersion
        : JSON.parse(parsedContent.metadata).compiler.version

    const compilerInput =
      projectType === ContractOutputType.TRUFFLE
        ? buildTruffleInput(
            parsedContent as unknown as {
              sourcePath: string
              metadata: string
            },
          )
        : buildCompilerInput(
            parsedContent.input.sources as {
              [key: string]: { content: string }
            },
            parsedContent.input.settings as CompilerSettings,
          )

    const compilationResult = await recompileStandard(
      solcLongVersion,
      compilerInput,
    )

    const contractNames = parseContractNamesFromSolcStandardJsonOutput(
      (compilationResult as any).output as {
        contracts: { [key: string]: string }
      },
    )
    console.log('Compiled:', JSON.stringify(contractNames, null, 2))

    const stagingResult = await submitStaging(compilationResult).catch(
      (err) => {
        console.error(err)
        return err
      },
    )
    if (stagingResult.claimUrl) {
      console.log(
        `Deploy staging complete! To claim this deploy staging, visit ${stagingResult.claimUrl}`,
      )
    } else {
      console.error(
        'There was an error uploading the compilation.',
        stagingResult.response?.data?.errors ?? 'Unknown Error.',
      )
    }
  }
}
