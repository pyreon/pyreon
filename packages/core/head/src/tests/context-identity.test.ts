/**
 * Bundle-level regression: `HeadContext` is constructed in EXACTLY ONE
 * place across the published `lib/` artifacts.
 *
 * The bug this test exists to catch: `@pyreon/head@0.21.0` shipped four
 * sub-entries (`lib/{index,provider,use-head,ssr}.js`) and the shared
 * `@vitus-labs/tools-rolldown` (< 2.4.0) invoked rolldown ONCE PER
 * SUB-ENTRY (no cross-entry shared chunks). Result: every sub-bundle
 * independently inlined `context.ts` and ran its own `createContext(null)`
 * at module init — each call minted a unique `Symbol.for(...).id`, so a
 * `useContext(HeadContext)` lookup in one bundle (e.g. the app's
 * `useHead` from `lib/use-head.js`) silently MISSED a
 * `provide(HeadContext)` from another (e.g. `renderWithHead` from
 * `lib/ssr.js`). The bug was invisible in dev / source-mode tests because
 * Vite's `bun` condition resolves to a single shared `src/context.ts`
 * (ESM single-evaluation guarantee), but SSG output silently dropped
 * every `useHead()`-registered tag — bad for SEO, social scrapers,
 * accessibility, no-JS.
 *
 * The durable fix lives upstream in `@vitus-labs/tools-rolldown >= 2.4.0`:
 * the build tool now creates SHARED CHUNKS across sub-entries, so the
 * shared `context.ts` gets hoisted into a single chunk (`lib/context.js`)
 * that every other sub-entry imports via relative-path `./context.js`.
 * `createContext(null)` runs exactly once at runtime; `HeadContext` is
 * one Symbol across every sub-entry's bundle. No per-package
 * externalization / self-package-import workaround needed.
 *
 * Structural assertions (the BUG-CLASS-LOCK — same intent, cleaner shape):
 *   1. `lib/context.js` is the ONLY bundle that calls `createContext(`.
 *   2. EVERY other published JS file under `lib/` (including
 *      `lib/_chunks/*.js` shared chunks the tool emits) has ZERO
 *      `createContext` references — they all import `HeadContext` from
 *      `./context.js`, sharing the single Symbol identity.
 *
 * Together these invariants make the bug class structurally impossible
 * to re-introduce silently — any future regression (e.g. downgrade of
 * the build tool below 2.4.0, or a build-config change that re-enables
 * per-entry inlining) flips one of the per-bundle counters and trips
 * the assertion. Bisect-verified by reverting the
 * `@vitus-labs/tools-rolldown` bump: every non-context sub-bundle gets
 * its own inlined `createContext(null)` call (2 occurrences each), and
 * the second assertion fails on the first non-context bundle.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PKG_ROOT = resolve(__dirname, '..', '..')
const LIB_DIR = resolve(PKG_ROOT, 'lib')
const libExists = existsSync(resolve(LIB_DIR, 'index.js'))

const read = (rel: string) => readFileSync(resolve(LIB_DIR, rel), 'utf8')

/** Every published JS file under lib/ (incl. _chunks/), excluding source maps. */
function publishedJsFiles(): string[] {
  const out: string[] = []
  for (const entry of readdirSync(LIB_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.js')) out.push(entry.name)
    else if (entry.isDirectory() && entry.name === '_chunks') {
      for (const sub of readdirSync(resolve(LIB_DIR, entry.name))) {
        if (sub.endsWith('.js')) out.push(`_chunks/${sub}`)
      }
    }
  }
  return out
}

/**
 * The bundle gate runs only when `lib/` has been built — `bun install`'s
 * postinstall bootstrap rebuilds whenever sources are newer than lib, so
 * in a normal dev session lib is always present. CI installs run the
 * same bootstrap. The `skip` is a defensive escape so the suite doesn't
 * false-fail in a partial worktree state where the user manually
 * deleted lib/.
 */
describe.skipIf(!libExists)(
  '@pyreon/head bundle-level HeadContext identity (regression for the SSG-Meta-dropped bug)',
  () => {
    // ── Invariant 1: ONE createContext call across all bundles ───────
    //
    // `lib/context.js` is the canonical single chunk. Every other
    // sub-bundle / shared chunk should import `HeadContext` from it,
    // NOT inline a fresh `createContext(null)` call.

    it('lib/context.js is the SINGLE bundle that calls createContext()', () => {
      const src = read('context.js')
      // 2 occurrences = the `import { createContext }` line + the actual
      // `createContext(null)` call at module init. This is the SOURCE OF
      // TRUTH for HeadContext's Symbol identity.
      expect(src.match(/createContext/g)?.length ?? 0).toBe(2)
      expect(src).toContain('createContext(null)')
    })

    // ── Invariant 2: ZERO createContext references in EVERY other JS ──
    //
    // Covers both the top-level sub-entries AND the `_chunks/*.js` files
    // the build tool now emits — any file that contains `createContext`
    // would be running it at module-init and minting its own Symbol.

    it('NO other lib/*.js (or lib/_chunks/*.js) calls createContext()', () => {
      const offenders: Array<{ file: string; count: number }> = []
      for (const rel of publishedJsFiles()) {
        if (rel === 'context.js') continue
        const count = read(rel).match(/createContext/g)?.length ?? 0
        if (count > 0) offenders.push({ file: rel, count })
      }
      expect(offenders).toEqual([])
    })

    // ── Invariant 3: the package.json wiring that enables it ─────────
    //
    // The `./context` sub-export gives `HeadContext` a stable public
    // address. Locking it here means a future revert immediately fails
    // the test.

    it('package.json declares the ./context sub-export', () => {
      const pkg = JSON.parse(read('../package.json')) as {
        exports: Record<string, { bun?: string; import?: string; types?: string }>
      }
      expect(pkg.exports['./context']).toBeDefined()
      expect(pkg.exports['./context']?.import).toBe('./lib/context.js')
      expect(pkg.exports['./context']?.bun).toBe('./src/context.ts')
    })
  },
)
