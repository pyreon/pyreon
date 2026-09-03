/**
 * "Was this module run directly, or imported?"
 *
 * ONE definition, because the answer is subtle and a second copy will drift.
 * `import.meta.main` is Bun-and-Node-≥24.2 only, so it is a HINT, not the test —
 * the repo hit exactly that with `@pyreon/mcp`'s bin, which started nothing under
 * Node LTS. Falling back to comparing the resolved entry path keeps it working on
 * every runtime, and `realpathSync` matters because a `.bin` shim is a symlink.
 *
 * The guard is what lets a script be IMPORTED to unit-test its pure helpers:
 * `check-bundle-budgets.ts` ran `await main()` unguarded, so importing it
 * executed the whole gate and hit `process.exit(1)` inside vitest.
 */

import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function isEntry(moduleUrl: string): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return pathToFileURL(realpathSync(entry)).href === moduleUrl
  } catch {
    return false
  }
}

/**
 * `isEntry` with the `import.meta.main` fast path applied first. Pass
 * `import.meta` so the flag is read from the CALLER's module, not this one.
 */
export function isModuleEntry(meta: { main?: boolean; url: string }): boolean {
  if (typeof meta.main === 'boolean') return meta.main
  return isEntry(meta.url)
}
