/**
 * `pyreon lathe [args]` — the Lathe code generator, from the front door.
 *
 * A thin, dependency-free delegator to `@pyreon/lathe`'s CLI
 * (`lathe generate` / `lathe check`). Any args pass straight through, so
 * `pyreon lathe generate ./openapi.yaml` is `lathe generate ./openapi.yaml`.
 *
 * Deliberately WITHOUT `@latest` (the `pyreon mcp` / `pyreon atlas` / `pyreon
 * loom` precedent): `npx @pyreon/lathe` prefers the project-local install, so
 * the generator that runs is the one pinned alongside the app it generates for.
 * A newer generator emitting against an older runtime is a class of drift
 * nobody would think to look for.
 */
import { execFileSync } from 'node:child_process'

export interface LatheOptions {
  /** Args after `lathe`, with `--dry-run` already extracted. */
  args: string[]
  dryRun: boolean
}

/** The `npx` argv that launches the Lathe CLI. Pure — unit-testable. */
export function buildLatheArgs(args: string[]): string[] {
  return ['--yes', '@pyreon/lathe', ...args]
}

export function runLathe(opts: LatheOptions): number {
  const npxArgs = buildLatheArgs(opts.args)
  if (opts.dryRun) {
    console.log(`npx ${npxArgs.join(' ')}`)
    return 0
  }
  try {
    // Inherit stdio: the generator streams its per-file report and its
    // red-exit contract (`--strict-native`, `check`) through unchanged.
    execFileSync('npx', npxArgs, { stdio: 'inherit' })
    return 0
  } catch (err) {
    const status = (err as { status?: number }).status
    return typeof status === 'number' ? status : 1
  }
}
