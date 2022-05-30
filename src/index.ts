#! /usr/bin/env node

import yargs from 'yargs'

import { stage } from './commands/stage'

yargs.scriptName('trakon').parse(process.argv.slice(2))

yargs
  .scriptName('trakon')
  .command({
    command: 'stage',
    describe: 'Discover compiled contracts in a directory for staging',
    handler: stage,
    builder: (y) => {
      return y
        .positional('path', {
          describe:
            'The path on your local filesystem to scan when discovering Truffle and Hardhat codebases.',
          default: (y.argv as any)._[1] ?? '.',
          type: 'string',
        })
        .option('projectId', {
          describe:
            'The ID of the Project for which this snapshot is intended, if there is one.',
          type: 'string',
        })
    },
  })
  .parse(process.argv.slice(2))
