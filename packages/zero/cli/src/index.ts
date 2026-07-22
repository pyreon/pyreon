import cac from 'cac'
// Version derived from package.json (never hardcode a self-version — the
// literal froze at 0.0.1 while releases advanced; see anti-patterns
// "Hardcoding a package's OWN version"). The build inlines the literal.
import packageJson from '../package.json' with { type: 'json' }
import { build } from './commands/build'
import { context } from './commands/context'
import { create } from './commands/create'
import { dev } from './commands/dev'
import { doctor } from './commands/doctor'
import { preview } from './commands/preview'

const cli = cac('zero')

cli
  .command('[root]', 'Start dev server')
  .alias('dev')
  // No CAC default — the command resolves precedence at runtime:
  // CLI flag > zero({ port }) from vite.config.ts > 3000 framework default.
  // A CAC default here would make `options.port` always defined and skip
  // the config-file fallback.
  .option('--port <port>', 'Server port (default: 3000)')
  .option('--host [host]', 'Server host')
  .option('--open', 'Open browser on start')
  .option('--routes', 'Print the full route table (collapsed to a one-line summary by default)')
  .action(dev)

cli
  // No `--mode` flag — the render mode comes from `zero({ mode })` in
  // vite.config.ts. The plugin instances are constructed from that
  // file, so a CLI flag structurally cannot override them; the old
  // flag only gated the CLI's (removed) duplicate build passes while
  // the plugin ran its configured mode regardless. See commands/build.ts.
  .command('build [root]', 'Build for production (one Vite build — the zero plugin owns the pipeline)')
  .action(build)

cli
  .command('preview [root]', 'Preview production build')
  // See `dev` for rationale — no CAC default; runtime precedence applies.
  .option('--port <port>', 'Server port (default: 3000)')
  .option('--host [host]', 'Server host')
  .action(preview)

cli
  .command('doctor [root]', 'Check for React patterns and framework issues')
  .option('--fix', 'Auto-fix fixable issues')
  .option('--json', 'Output as JSON')
  .option('--ci', 'CI mode — exit with code 1 on errors')
  .option('--full', 'Run slow gates (audit-types, bundle-budgets)')
  .action(doctor)

cli
  .command('context [root]', 'Generate project context for AI tools')
  .option('--out <path>', 'Output path (default: .pyreon/context.json)')
  .action(context)

cli.command('create <name>', 'Scaffold a new Pyreon Zero project').action(create)

cli.help()
cli.version(packageJson.version)

try {
  cli.parse()
} catch (err) {
  // cac throws a `CACError` SYNCHRONOUSLY during parse for an unknown option or
  // a missing required argument (e.g. `zero doctor --typo`). Surface a friendly
  // message + usage hint instead of leaking a raw stack trace. Async errors
  // inside a command's own action are handled by that action — this only
  // catches parse-time argv errors.
  if (err instanceof Error && err.name === 'CACError') {
    console.error(`error: ${err.message}`)
    console.error('Run `zero --help` or `zero <command> --help` for usage.')
    process.exit(1)
  }
  throw err
}
