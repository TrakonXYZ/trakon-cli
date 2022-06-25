import yargs from 'yargs'
import { loadTrakonCredentials } from './api.service'
import env from './env'

export const envMiddleware = (
  argv: yargs.ArgumentsCamelCase<{
    apiKey?: string
    verbose?: boolean
  }>,
) => {
  env.API_KEY = argv.apiKey || loadTrakonCredentials() || ''
  env.VERBOSE = argv.verbose ?? false
}
