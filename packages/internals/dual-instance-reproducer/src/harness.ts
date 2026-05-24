/**
 * Dual-instance reproducer harness.
 *
 * Synthesizes the dual-module-instance scenario inside a single Node process
 * by:
 *   1. Locating the published `@pyreon/reactivity/lib/` build artifact
 *   2. Copying the ENTIRE lib tree (preserving relative imports) to a tmp
 *      directory
 *   3. Importing both the original AND the copy via absolute `file://` URLs
 *      — Node's ESM loader keys its module cache by URL, so two different
 *      absolute paths → two distinct module records → two instances of
 *      every module-level binding (including state).
 *
 * This is the cleanest pure-Node reproducer of the bug class. It does NOT
 * require a Vite build or a real consumer app — but it precisely models
 * what happens when Vite's [bare] vs [package entry] resolvers diverge OR
 * when sub-dep version mismatch creates two lib paths in `node_modules`.
 */
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Resolve the absolute path of `@pyreon/reactivity/lib/` in the workspace.
 *
 * Walks up from `process.cwd()` (which vitest sets to the package being
 * tested) until it finds a directory containing `packages/core/reactivity/lib/index.js`.
 * This works regardless of where the test file lives on disk — it just
 * needs to find the monorepo root.
 */
function resolveReactivityLibRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 10; i++) {
    const libCandidate = join(dir, 'packages/core/reactivity/lib')
    if (existsSync(libCandidate) && existsSync(join(libCandidate, 'index.js'))) {
      return libCandidate
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(
    `[dual-instance-reproducer] Could not locate packages/core/reactivity/lib/index.js by walking up from ${process.cwd()}. ` +
      'Run `bun scripts/bootstrap.ts` to build the workspace packages.',
  )
}

export interface DualInstanceHandle {
  instanceA: Record<string, unknown>
  instanceB: Record<string, unknown>
  cleanup: () => void
}

/**
 * Load `@pyreon/reactivity` TWICE as distinct module instances.
 *
 * Returns the two instances' namespaces and a cleanup that removes the
 * temp copy. The harness uses Node's native ESM loader — no Vite, no
 * webpack — so any "share-via-globalThis" pattern (γ) is honored if and
 * only if the framework's source registers it on globalThis explicitly.
 */
export async function loadDualReactivityInstances(): Promise<DualInstanceHandle> {
  const realLibRoot = resolveReactivityLibRoot()

  // Make a sibling copy of the entire lib/ tree.
  const tmpRoot = mkdtempSync(join(tmpdir(), 'pyreon-dual-instance-'))
  const tmpLibRoot = join(tmpRoot, 'lib')
  cpSync(realLibRoot, tmpLibRoot, { recursive: true })

  // Import both. Node treats different absolute paths as different modules.
  const instanceA = (await import(/* @vite-ignore */ `file://${realLibRoot}/index.js`)) as Record<
    string,
    unknown
  >
  const instanceB = (await import(/* @vite-ignore */ `file://${tmpLibRoot}/index.js`)) as Record<
    string,
    unknown
  >

  // Sanity: the two namespace objects MUST be distinct module records.
  // If they're identical, Node deduped them (which would mean our reproducer
  // isn't actually creating dual instances — defensive check).
  if (instanceA === instanceB) {
    throw new Error(
      '[dual-instance-reproducer] Failed to load two distinct module instances. ' +
        'Node deduped the imports. The reproducer is invalid in this environment.',
    )
  }

  return {
    instanceA,
    instanceB,
    cleanup: () => {
      try {
        rmSync(tmpRoot, { recursive: true, force: true })
      } catch {
        // best-effort cleanup
      }
    },
  }
}

/**
 * Snapshot every `Symbol.for('pyreon-*')` key currently on globalThis.
 * Used by tests that assert "no globalThis pollution" — under α/β/ζ
 * candidates, this set should be empty after loading reactivity (no
 * framework state on the global registry). Under γ (current main),
 * this set will contain the cross-module-state keys.
 */
export function snapshotPyreonGlobalKeys(): symbol[] {
  const host = globalThis as Record<symbol, unknown>
  const out: symbol[] = []
  for (const sym of Object.getOwnPropertySymbols(host)) {
    const desc = sym.description ?? ''
    if (desc.startsWith('pyreon-')) out.push(sym)
  }
  return out
}

/**
 * Clear all `Symbol.for('pyreon-*')` keys from globalThis. Used in
 * test teardown so successive test runs see a fresh global registry.
 *
 * Note: this does NOT clear the symbols themselves (`Symbol.for` is
 * idempotent at the language level — same key always returns the same
 * symbol). It only removes the values on `globalThis`. A subsequent
 * `defineCrossModuleState` call with the same key will allocate a new
 * state object.
 */
export function clearPyreonGlobalKeys(): void {
  const host = globalThis as Record<symbol, unknown>
  for (const sym of Object.getOwnPropertySymbols(host)) {
    const desc = sym.description ?? ''
    if (desc.startsWith('pyreon-')) {
      delete host[sym]
    }
  }
}
