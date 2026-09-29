import type { CliSpec } from './argv'

/**
 * Each command's handler. They receive exactly what cac used to hand them:
 * the declared positionals (`[root]` → one value, `[...args]` → an array),
 * then the parsed options object.
 */
export interface ZeroHandlers {
  dev: (root: string | undefined, options: never) => unknown
  build: (root: string | undefined, options: never) => unknown
  preview: (root: string | undefined, options: never) => unknown
  doctor: (root: string | undefined, options: never) => unknown
  context: (root: string | undefined, options: never) => unknown
  create: (args: string[], options: never) => unknown
}

/** The `zero` command table — the single declaration `--help` is rendered from. */
export function zeroCli(version: string, handlers: ZeroHandlers): CliSpec {
  return {
    name: 'zero',
    version,
    commands: [
      {
        rawName: '[root]',
        description: 'Start dev server',
        aliases: ['dev'],
        // No default for `--port` — the command resolves precedence at
        // runtime: CLI flag > zero({ port }) from vite.config.ts > 3000
        // framework default. A parser default would make `options.port`
        // always defined and skip the config-file fallback.
        options: [
          { rawName: '--port <port>', description: 'Server port (default: 3000)' },
          { rawName: '--host [host]', description: 'Server host' },
          { rawName: '--open', description: 'Open browser on start' },
          {
            rawName: '--routes',
            description: 'Print the full route table (collapsed to a one-line summary by default)',
          },
        ],
        action: handlers.dev,
      },
      {
        // No `--mode` flag — the render mode comes from `zero({ mode })` in
        // vite.config.ts. The plugin instances are constructed from that
        // file, so a CLI flag structurally cannot override them; the old
        // flag only gated the CLI's (removed) duplicate build passes while
        // the plugin ran its configured mode regardless. See commands/build.ts.
        rawName: 'build [root]',
        description: 'Build for production (one Vite build — the zero plugin owns the pipeline)',
        action: handlers.build,
      },
      {
        rawName: 'preview [root]',
        description: 'Preview production build',
        // See `dev` for rationale — no default; runtime precedence applies.
        options: [
          { rawName: '--port <port>', description: 'Server port (default: 3000)' },
          { rawName: '--host [host]', description: 'Server host' },
        ],
        action: handlers.preview,
      },
      {
        rawName: 'doctor [root]',
        description: 'Check for React patterns and framework issues',
        options: [
          { rawName: '--fix', description: 'Auto-fix fixable issues' },
          { rawName: '--json', description: 'Output as JSON' },
          { rawName: '--ci', description: 'CI mode — exit with code 1 on errors' },
          { rawName: '--full', description: 'Run slow gates (audit-types, bundle-budgets)' },
        ],
        action: handlers.doctor,
      },
      {
        rawName: 'context [root]',
        description: 'Generate project context for AI tools',
        options: [{ rawName: '--out <path>', description: 'Output path (default: .pyreon/context.json)' }],
        action: handlers.context,
      },
      {
        // Delegates to @pyreon/create-zero; every argument after `create` is
        // forwarded unchanged, so its flags (`--template`, `--yes`, …) all work.
        rawName: 'create [...args]',
        description: 'Scaffold a new Pyreon Zero project (runs @pyreon/create-zero)',
        allowUnknownOptions: true,
        action: handlers.create,
      },
    ],
  }
}
