// Version derived from package.json (never hardcode a self-version — the
// literal froze at 0.0.1 while releases advanced; see anti-patterns
// "Hardcoding a package's OWN version"). The build inlines the literal.
import packageJson from '../package.json' with { type: 'json' }
import { CliUsageError, runCli } from './argv'
import { zeroCli } from './cli'
import { build } from './commands/build'
import { context } from './commands/context'
import { create } from './commands/create'
import { type DevOptions, dev } from './commands/dev'
import { doctor } from './commands/doctor'
import { preview } from './commands/preview'
import { checkRootArg } from './commands/unknown-command'

const cli = zeroCli(packageJson.version, {
  dev: (root: string | undefined, options: DevOptions) => {
    // Every unknown word lands in `[root]`, so `zero biuld` would start a
    // dev server in a directory that does not exist. Reject it instead.
    const error = checkRootArg(root)
    if (error) {
      console.error(error)
      process.exit(1)
    }
    return dev(root, options)
  },
  build,
  preview,
  doctor,
  context,
  create,
})

try {
  runCli(cli, process.argv.slice(2))
} catch (err) {
  // An unknown option, an option missing its value, or surplus arguments
  // (e.g. `zero doctor --typo`) is rejected SYNCHRONOUSLY during parsing.
  // Surface a friendly message + usage hint instead of a raw stack trace.
  // Async errors inside a command's own action are handled by that action —
  // this only catches parse-time argv errors.
  if (err instanceof CliUsageError) {
    console.error(`error: ${err.message}`)
    console.error('Run `zero --help` or `zero <command> --help` for usage.')
    process.exit(1)
  }
  throw err
}
