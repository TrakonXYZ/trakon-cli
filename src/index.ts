#! /usr/bin/env node
import yargs from 'yargs'

import { review } from './commands/review'
import { envMiddleware } from './middleware'

yargs
  .scriptName('trakon')
  .usage('$0 <cmd> [args]')
  .option('api-key', {
    type: 'string',
    describe: 'API key generated from https://reviews.trakon.xyz',
    global: false,
  })
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    describe: 'Verbose output logging',
    global: false,
  })
  .middleware([envMiddleware])
  .command({
    command: 'review [path]',
    describe: 'Discover compiled contracts in a directory for reviewing',
    handler: review,
    builder: (y) => {
      return y.positional('path', {
        describe:
          'The path on your local filesystem to scan when discovering Truffle and Hardhat codebases.',
        default: '.',
        demandOption: false,
        type: 'string',
      })
    },
  })
  .global(['api-key', 'verbose'])
  .demandCommand(1, '')
  .help()
  .showHelpOnFail(true).argv
