// Version derived from package.json (never hardcode a self-version — the
// literal froze at 0.0.1 while releases advanced; see anti-patterns
// "Hardcoding a package's OWN version"). The build inlines the literal.
import { createTerm, finding } from '@pyreon/ansi'
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

/** `✗ zero · problem`, then `fix:`, on stderr; exit 1. */
function usageError(message: string, fix: string): never {
  const t = createTerm({ isTTY: Boolean(process.stderr.isTTY) })
  console.error(finding(t, { severity: 'error', source: 'zero', message, fix }, { indent: 0, width: t.width }).join('\n'))
  process.exit(1)
}

const cli = zeroCli(packageJson.version, {
  dev: (root: string | undefined, options: DevOptions) => {
    // Every unknown word lands in `[root]`, so `zero biuld` would start a
    // dev server in a directory that does not exist. Reject it instead.
    const error = checkRootArg(root)
    if (error) {
      usageError(error.replace(/^\[Pyreon\] /, ''), 'run zero --help for the list of commands')
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
    usageError(err.message, 'run zero --help or zero <command> --help for usage')
  }
  throw err
}
