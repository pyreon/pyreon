/**
 * `pyreon atlas [args]` — the Atlas component workbench, from the front door.
 *
 * A thin, dependency-free delegator to `@pyreon/atlas`'s CLI (`atlas scan` /
 * `atlas dev` / `atlas verify-browser`). Any args pass straight through, so
 * `pyreon atlas scan .` ≡ `atlas scan .`.
 *
 * Deliberately WITHOUT `@latest` (the `pyreon mcp` precedent): `npx
 * @pyreon/atlas` prefers the project-local install, so the workbench that
 * scans/serves your components matches YOUR installed Pyreon version — and
 * only fetches on demand when the project doesn't have it. The point is a
 * single front door: `pyreon atlas dev` sits next to `pyreon new` /
 * `pyreon doctor` instead of a separately-remembered package invocation.
 */
import { execFileSync } from 'node:child_process'

export interface AtlasOptions {
  /** Args after `atlas`, with `--dry-run` already extracted. */
  args: string[]
  dryRun: boolean
}

/** The `npx` argv that launches the Atlas CLI. Pure — unit-testable. */
export function buildAtlasArgs(args: string[]): string[] {
  // No `@latest` — prefer the project-local @pyreon/atlas (the scanned
  // catalog then matches the installed framework); npx fetches on demand
  // when it isn't installed.
  return ['--yes', '@pyreon/atlas', ...args]
}

export function runAtlas(opts: AtlasOptions): number {
  const npxArgs = buildAtlasArgs(opts.args)
  if (opts.dryRun) {
    console.log(`npx ${npxArgs.join(' ')}`)
    return 0
  }
  try {
    // Inherit stdio: `atlas dev` owns the terminal for the life of the dev
    // server; `atlas scan` streams its summary + red-exit contract through.
    execFileSync('npx', npxArgs, { stdio: 'inherit' })
    return 0
  } catch (err) {
    const status = (err as { status?: number }).status
    return typeof status === 'number' ? status : 1
  }
}
