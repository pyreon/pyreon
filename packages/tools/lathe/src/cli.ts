/** `@pyreon/lathe/cli` — argv parsing, the run loop, and the bin entry. */
export { main } from './cli/main'
export {
  HELP,
  parseArgv,
  run,
  type Argv,
  type Fs,
  type JsonProject,
  type JsonReport,
  type RunResult,
} from './cli/run'
export { renderReport, shouldColor } from './cli/report'
