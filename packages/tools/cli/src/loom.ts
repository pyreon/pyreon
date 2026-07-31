/**
 * `pyreon loom [args]` — the Loom dependency observatory, from the front door.
 *
 * A thin, dependency-free delegator to `@pyreon/loom`'s CLI (`loom scan` /
 * `loom dev`). Any args pass straight through, so `pyreon loom scan .` ≡
 * `loom scan .`.
 *
 * Deliberately WITHOUT `@latest` (the `pyreon mcp` / `pyreon atlas`
 * precedent): `npx @pyreon/loom` prefers the project-local install, only
 * fetching on demand when the project doesn't have it.
 */
import { execFileSync } from 'node:child_process'

export interface LoomOptions {
  /** Args after `loom`, with `--dry-run` already extracted. */
  args: string[]
  dryRun: boolean
}

/** The `npx` argv that launches the Loom CLI. Pure — unit-testable. */
export function buildLoomArgs(args: string[]): string[] {
  return ['--yes', '@pyreon/loom', ...args]
}

export function runLoom(opts: LoomOptions): number {
  const npxArgs = buildLoomArgs(opts.args)
  if (opts.dryRun) {
    console.log(`npx ${npxArgs.join(' ')}`)
    return 0
  }
  try {
    // Inherit stdio: `loom dev` owns the terminal for the life of the dev
    // server; `loom scan` streams its findings + red-exit contract through.
    execFileSync('npx', npxArgs, { stdio: 'inherit' })
    return 0
  } catch (err) {
    const status = (err as { status?: number }).status
    return typeof status === 'number' ? status : 1
  }
}
