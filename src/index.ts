#! /usr/bin/env node
import yargs from 'yargs'

import { snapshot } from './commands/snapshot'
import { envMiddleware } from './middleware'

yargs
  .scriptName('trakon')
  .usage('$0 <cmd> [args]')
  .option('api-key', {
    type: 'string',
    describe: 'API key generated from https://trakon.xyz',
    global: false,
  })
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    describe: 'Verbose output',
    global: false,
  })
  .middleware([envMiddleware])
  .command({
    command: 'snapshot [path]',
    describe: 'Discover compiled contracts in a directory for snapshotting',
    handler: snapshot,
    builder: (y) => {
      return y
        .positional('path', {
          describe:
            'The path on your local filesystem to scan when discovering Truffle and Hardhat codebases.',
          default: '.',
          demandOption: false,
          type: 'string',
        })
        .option('project-id', {
          describe:
            'The project ID for which this snapshot is intended, if there is one.',
          type: 'string',
        })
    },
  })
  .global(['api-key', 'verbose'])
  .demandCommand(1, '')
  .help()
  .showHelpOnFail(true).argv
