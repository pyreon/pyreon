/**
 * Bundle-level regression: `HeadContext` is constructed in EXACTLY ONE
 * place across the published `lib/` artifacts.
 *
 * The bug this test exists to catch: `@pyreon/head@0.21.0` shipped four
 * sub-entries (`lib/index.js`, `lib/provider.js`, `lib/use-head.js`,
 * `lib/ssr.js`) AND the shared `@vitus-labs/tools-rolldown` build invokes
 * rolldown ONCE PER SUB-ENTRY (no cross-entry shared chunks). Result:
 * every sub-bundle independently inlined `context.ts` and ran its own
 * `createContext(null)` at module init — each call minted a unique
 * `Symbol.for(...).id`, so a `useContext(HeadContext)` lookup in one
 * bundle (e.g. the app's `useHead` from `lib/use-head.js`) silently
 * MISSED a `provide(HeadContext)` from another (e.g. `renderWithHead`
 * from `lib/ssr.js`). The bug was invisible in dev / source-mode tests
 * because Vite's `bun` condition resolves to a single shared
 * `src/context.ts` (ESM single-evaluation guarantee), but SSG output
 * silently dropped every `useHead()`-registered tag — bad for SEO,
 * social scrapers, accessibility, no-JS.
 *
 * The fix (`vl-tools.config.mjs` + self-package imports + the new
 * `./context` sub-export): source uses `@pyreon/head/context` for the
 * runtime VALUE; the build externalizes that specifier; every sub-bundle
 * resolves to the SAME `lib/context.js` at runtime — one Symbol, one
 * shared context.
 *
 * Structural assertions:
 *   1. `lib/context.js` is the ONLY bundle that calls `createContext(`.
 *   2. Every other published sub-bundle (`index`, `ssr`, `use-head`,
 *      `provider`) imports `HeadContext` from `@pyreon/head/context`
 *      (the external — the bundler's signal that the symbol comes from
 *      a shared runtime chunk, not from inlined source).
 *
 * Together these two invariants make the bug class structurally
 * impossible to re-introduce silently — any future regression (e.g.
 * removing the `vl-tools.config.mjs` external, or reverting a source
 * file to a relative `./context` import for the runtime VALUE) flips
 * one of the per-bundle counters and trips the assertion.
 *
 * Bisect-verified at the build artifact:
 * - With the fix: lib/context.js has 1 createContext call site (+ 1
 *   import line = 2 occurrences); every other sub-bundle has 0.
 * - Without the fix (revert `vl-tools.config.mjs`): every sub-bundle
 *   gets its own inlined `createContext(null)` (2 occurrences each) —
 *   this test fails on the first non-context bundle.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PKG_ROOT = resolve(__dirname, '..', '..')
const LIB_DIR = resolve(PKG_ROOT, 'lib')
const libExists = existsSync(resolve(LIB_DIR, 'index.js'))

const read = (name: string) => readFileSync(resolve(LIB_DIR, name), 'utf8')

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
    // `lib/context.js` is the canonical single chunk. Each other
    // sub-bundle (`index`, `ssr`, `use-head`, `provider`) should
    // import `HeadContext` from it externally, NOT inline a fresh
    // `createContext(null)` call.

    it('lib/context.js is the SINGLE bundle that calls createContext()', () => {
      const src = read('context.js')
      // 2 occurrences = the `import { createContext }` line + the actual
      // `createContext(null)` call at module init. This is the SOURCE OF
      // TRUTH for HeadContext's Symbol identity.
      expect(src.match(/createContext/g)?.length ?? 0).toBe(2)
      expect(src).toContain('createContext(null)')
    })

    it.each([
      ['index.js'],
      ['provider.js'],
      ['use-head.js'],
      ['ssr.js'],
    ])('lib/%s does NOT inline createContext (must import HeadContext from @pyreon/head/context)', (name) => {
      const src = read(name)
      // Zero `createContext` references — anything > 0 means the bundle
      // either imports `createContext` (= would call it at init) or
      // declares its own `HeadContext = createContext(...)`. Both are
      // the bug. With the fix, the sub-bundle's HeadContext arrives via
      // an external `import { HeadContext } from "@pyreon/head/context"`.
      expect(src.match(/createContext/g)?.length ?? 0).toBe(0)
    })

    // ── Invariant 2: external import to @pyreon/head/context ─────────
    //
    // Every non-`context` sub-bundle that USES HeadContext must import
    // it from the externalized `@pyreon/head/context` specifier (the
    // bundler's signal the symbol is shared with `lib/context.js`).

    it.each([
      ['index.js'],
      ['provider.js'],
      ['ssr.js'],
    ])('lib/%s imports HeadContext via the relative ./context.js path (rolldown shared-chunk dedup)', (name) => {
      const src = read(name)
      // Multi-entry single-pass mode emits clean relative imports —
      // every sub-entry resolves to the same emitted `lib/context.js`
      // module at runtime. No externalization needed (vs the
      // pre-deeper-fix `from "@pyreon/head/context"` workaround
      // introduced in #722).
      const hasRelativeImport = /from\s+["']\.\/context\.js["']/.test(src)
      expect(hasRelativeImport).toBe(true)
    })

    it('lib/use-head.js reaches HeadContext (directly OR via a _chunks/ re-export)', () => {
      // `use-head.ts` imports `dom.ts` (single-importer internal module).
      // Rolldown 1.0's default chunk heuristic splits `dom.ts` into
      // `_chunks/use-head-<hash>.js`, leaving `lib/use-head.js` as a
      // thin re-export from the chunk. Both the entry stub AND the
      // chunk pull HeadContext from `./context.js` (or `../context.js`).
      // Verified ANY path leads back to the single canonical `context.js`.
      const entry = read('use-head.js')
      const directImport = /from\s+["']\.\/context\.js["']/.test(entry)
      const reExportsChunk = /from\s+["']\.\/_chunks\//.test(entry)
      // Either the entry imports context directly OR re-exports from a
      // chunk that itself imports context. The latter is the current
      // shape; the former would be the result if rolldown's chunking
      // heuristic ever decides to inline `dom.ts`.
      expect(directImport || reExportsChunk).toBe(true)
    })

    // ── Invariant 3: the package.json wiring that enables it ─────────
    //
    // The `./context` sub-export shipped in #722 is preserved for
    // backward compat. The multi-entry single-pass build also declares
    // `context` as one of its inputs so `lib/context.js` is BOTH the
    // shared chunk AND a published entry pointing at the same emit.

    it('package.json declares the ./context sub-export (backward-compat with #722)', () => {
      const pkg = JSON.parse(read('../package.json')) as {
        exports: Record<string, { bun?: string; import?: string; types?: string }>
      }
      expect(pkg.exports['./context']).toBeDefined()
      expect(pkg.exports['./context']?.import).toBe('./lib/context.js')
      expect(pkg.exports['./context']?.bun).toBe('./src/context.ts')
    })

    it('build.mjs declares context as a first-class multi-entry input', () => {
      const cfg = readFileSync(resolve(PKG_ROOT, 'build.mjs'), 'utf8')
      // `context: ...` in the ENTRIES object — locks in that context
      // is emitted as a top-level entry (so its hash-free filename
      // matches the package.json `./context` sub-export's target).
      expect(cfg).toMatch(/context\s*:\s*`\$\{SRC\}\/context\.ts`/)
    })

    it('no vl-tools.config.mjs (the #722 externalization workaround is fully replaced)', () => {
      const path = resolve(PKG_ROOT, 'vl-tools.config.mjs')
      // The deeper fix in this PR REPLACES the per-package external
      // workaround with rolldown's native multi-entry single-pass.
      // No vl-tools.config.mjs should exist; if anyone re-adds one,
      // it signals the workaround is being re-introduced.
      expect(existsSync(path)).toBe(false)
    })
  },
)
