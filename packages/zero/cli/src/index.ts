// Version derived from package.json (never hardcode a self-version — the
// literal froze at 0.0.1 while releases advanced; see anti-patterns
// "Hardcoding a package's OWN version"). The build inlines the literal.
import packageJson from '../package.json' with { type: 'json' }
import { CliUsageError, runCli } from './argv'
import { zeroCli } from './cli'
import type { ContextOptions } from './commands/context'
import type { DevOptions } from './commands/dev'
import type { DoctorOptions } from './commands/doctor'
import type { PreviewOptions } from './commands/preview'
import { checkRootArg } from './commands/unknown-command'

/**
 * `✗ zero · problem`, then `fix:`, on stderr; exit 1. The theme is loaded
 * on this path only, so `zero --help` and `--version` stay a small import.
 */
async function usageError(message: string, fix: string): Promise<never> {
  const { createTerm, finding } = await import('@pyreon/ansi')
  const t = createTerm({ isTTY: Boolean(process.stderr.isTTY) })
  console.error(finding(t, { severity: 'error', source: 'zero', message, fix }, { indent: 0, width: t.width }).join('\n'))
  process.exit(1)
}

// Each command is loaded when it runs: a command module pulls in Vite, the
// theme and the zero runtime, none of which `zero --help` needs.
const cli = zeroCli(packageJson.version, {
  dev: async (root: string | undefined, options: DevOptions) => {
    // Every unknown word lands in `[root]`, so `zero biuld` would start a
    // dev server in a directory that does not exist. Reject it instead.
    const error = checkRootArg(root)
    if (error) {
      return usageError(error.replace(/^\[Pyreon\] /, ''), 'run zero --help for the list of commands')
    }
    return (await import('./commands/dev')).dev(root, options)
  },
  build: async (root: string | undefined) => (await import('./commands/build')).build(root),
  preview: async (root: string | undefined, options: PreviewOptions) =>
    (await import('./commands/preview')).preview(root, options),
  doctor: async (root: string | undefined, options: DoctorOptions) => (await import('./commands/doctor')).doctor(root, options),
  context: async (root: string | undefined, options: ContextOptions) =>
    (await import('./commands/context')).context(root, options),
  create: async () => (await import('./commands/create')).create(),
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
    void usageError(err.message, 'run zero --help or zero <command> --help for usage')
  } else {
    throw err
  }
}
