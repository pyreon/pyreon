/**
 * `zero create [name] [flags]` — scaffold a new Pyreon Zero project.
 *
 * Delegates to `@pyreon/create-zero` (a direct dependency of this package),
 * the same scaffolder `bun create @pyreon/zero` runs, so there is exactly one
 * scaffolding implementation and one set of templates. Every argument after
 * `create` is forwarded verbatim — the project name, `--template`, `--yes`,
 * `--help` — and create-zero owns the interactive prompts.
 *
 * This used to copy a `templates/default` directory that create-zero has not
 * shipped for a long time, so the command always failed with
 * "Template not found".
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/** Absolute path to the installed create-zero bin script. */
export function resolveCreateZeroBin(): string {
  const require = createRequire(import.meta.url)
  const pkgJson = require.resolve('@pyreon/create-zero/package.json')
  return join(dirname(pkgJson), 'bin', 'create-zero.js')
}

/** The arguments that follow `create` on the command line. */
export function argsAfterCreate(argv: readonly string[]): string[] {
  const i = argv.indexOf('create')
  return i === -1 ? [] : argv.slice(i + 1)
}

/**
 * Run create-zero with `args`, inheriting stdio so its prompts work.
 * Returns the scaffolder's exit code.
 */
export function runCreate(args: readonly string[]): number {
  const result = spawnSync(process.execPath, [resolveCreateZeroBin(), ...args], {
    stdio: 'inherit',
  })
  if (result.error) {
    console.error(`[Pyreon] zero create: could not start @pyreon/create-zero: ${result.error.message}`)
    return 1
  }
  return result.status ?? 1
}

export function create(): void {
  process.exit(runCreate(argsAfterCreate(process.argv.slice(2))))
}
