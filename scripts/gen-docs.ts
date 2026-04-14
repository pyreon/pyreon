#!/usr/bin/env bun
/**
 * gen-docs — CLI entry for the manifest → docs pipeline.
 *
 * Pure-function implementation lives in `gen-docs-core.ts` so tests
 * can import without hitting the shebang that Vite/Rolldown reject
 * when bundling downstream test files. `main()` is injectable for
 * in-process test coverage.
 *
 * ## CLI
 *
 * - `bun run gen-docs` — regenerate in-place.
 * - `bun run gen-docs --check` — exit 0 if in sync, 1 if any file
 *   would change. Prints a unified diff (LCS-based) of exactly what
 *   would change.
 *
 * ## Rollback / override
 *
 * If a bug here blocks an urgent merge, a repo admin can temporarily
 * remove `Docs Sync` from the required-checks list in branch-protection
 * settings. File a follow-up, then restore the check. **Do not bypass
 * by hand-editing generated lines** — the next gen-docs run will
 * revert those edits silently.
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { main } from './gen-docs-core'

const SELF = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(dirname(SELF), '..')

// Guard the CLI entry so tests can import this module without running
// `main()` as a side effect. `import.meta.main` is true only when bun
// invokes the file as the entry script.
if (import.meta.main) {
  await main(REPO_ROOT, process.argv.slice(2))
}
