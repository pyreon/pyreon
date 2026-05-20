/**
 * Multi-entry single-pass build for `@pyreon/head`.
 *
 * Replaces the shared `vl_rolldown_build` tool for this package only.
 *
 * Why a per-package build script: the shared `@vitus-labs/tools-rolldown`
 * invokes rolldown ONCE PER SUB-ENTRY (no cross-entry shared chunks).
 * Every sub-bundle therefore independently inlined `context.ts` and ran
 * its own `createContext(null)` at module init — each call minted a
 * unique `Symbol.id`, so `useContext(HeadContext)` lookups across bundles
 * silently missed `provide(HeadContext)` writes. PR #722 patched this
 * via per-package externalization (a `vl-tools.config.mjs` + a new
 * public `./context` sub-export + self-package source imports + a vitest
 * alias). This script replaces those workarounds with rolldown's NATIVE
 * multi-entry single-pass mode — every entry is passed to ONE rolldown
 * invocation; the shared `context` module is deduplicated automatically;
 * every non-context entry emits a plain relative `import { ... } from
 * "./context.js"`. No externalization config, no self-package imports,
 * no vitest alias needed.
 *
 * `context` is declared as a first-class entry alongside `index` / `ssr`
 * / `use-head` / `provider` so the resulting `lib/context.js` is BOTH
 * the shared chunk AND a published entry — preserves the `./context`
 * sub-export added in #722 for any consumer that came to depend on it.
 *
 * Pattern reusable for any other Pyreon multi-entry package that hits
 * the same shared-context bug class — copy this file and adjust the
 * entries list. Worth extracting to a shared `scripts/build-multi-entry-package.mjs`
 * helper OR (the actual deeper fix) upstreaming the multi-entry mode to
 * `@vitus-labs/tools-rolldown` itself; both are deliberate follow-ups
 * out of scope for this PR.
 *
 * See `tests/context-identity.test.ts` for the bundle-level regression
 * gate that locks the contract.
 */

import { rolldown } from 'rolldown'
import { rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = __dirname
const SRC = resolve(ROOT, 'src')
const OUT = resolve(ROOT, 'lib')

const ENTRIES = {
  index: `${SRC}/index.ts`,
  context: `${SRC}/context.ts`,
  provider: `${SRC}/provider.ts`,
  'use-head': `${SRC}/use-head.ts`,
  ssr: `${SRC}/ssr.ts`,
}

// External packages — anything in dependencies / peerDependencies. The
// shared tool reads these from package.json's deps fields; mirror that
// here so we don't drift. `@pyreon/runtime-server` is optional (per
// peerDependenciesMeta) but still external — it must not be bundled
// into the SSR entry.
const EXTERNAL = [
  '@pyreon/core',
  '@pyreon/reactivity',
  '@pyreon/runtime-server',
]

const NODE_BUILTIN = /^node:/

const start = performance.now()

// Wipe lib/ for a deterministic build — no orphan files left from a
// previous build with different entry shapes.
await rm(OUT, { recursive: true, force: true })

// ── Pass 1: code build (multi-entry single-pass with shared chunks) ──
const codeBundle = await rolldown({
  input: ENTRIES,
  external: (id) => {
    if (NODE_BUILTIN.test(id)) return true
    return EXTERNAL.some((dep) => id === dep || id.startsWith(`${dep}/`))
  },
  treeshake: { moduleSideEffects: false },
})

await codeBundle.write({
  dir: OUT,
  format: 'es',
  entryFileNames: '[name].js',
  // Single-importer internal modules (`dom.ts` — used only by
  // `use-head.ts`) land in `_chunks/use-head-<hash>.js` with `use-head.js`
  // as a 3-line re-export stub. Rolldown 1.0's chunk inlining is opt-in
  // via `advancedChunks.groups` (which would need explicit grouping
  // config to suppress this); accepting the extra chunk file is the
  // smallest stable shape today. Functionally identical to a bundled
  // entry — every consumer of `@pyreon/head/use-head` still gets the
  // useHead binding through the package's `exports` resolution. The
  // bug-class invariant (single `createContext(null)` call across
  // every published file) holds either way; the regression test
  // asserts on `createContext` counts, not file layout.
  chunkFileNames: '_chunks/[name]-[hash].js',
  sourcemap: true,
  exports: 'named',
})

await codeBundle.close()

// ── Pass 2: type declarations via tsc ───────────────────────────────
//
// `tsc --emitDeclarationOnly` is more reliable than `rolldown-plugin-dts`
// for this multi-entry shape. The dts plugin (even in `emitDtsOnly`
// mode + per-entry calls) produces empty `<name>.d.ts` stubs alongside
// real `<name>2.d.ts` files — its internal collision-avoidance pattern
// when the input filename matches the desired output. Switching to tsc
// emits one clean `<name>.d.ts` per .ts source under `src/` — including
// the internal `dom.ts` / `manifest.ts` / `tests/*` files (filtered
// from the published surface via `tsconfig.build.json` below).
//
// dts being per-source (vs bundled per-entry) doesn't reintroduce the
// runtime bug: the bug class was about RUNTIME `createContext(null)`
// calls minting duplicate Symbols. dts files contain only type
// information (zero runtime), so the dts file layout has no
// Symbol-identity impact.
const tscResult = spawnSync('bun', [
  'x', 'tsc',
  '--project', `${ROOT}/tsconfig.build.json`,
], { stdio: 'inherit' })
if (tscResult.status !== 0) {
  console.error('[@pyreon/head build] tsc dts emit failed')
  process.exit(tscResult.status ?? 1)
}

const elapsed = (performance.now() - start).toFixed(0)
console.log(`@pyreon/head built (${elapsed}ms, multi-entry single-pass, ${Object.keys(ENTRIES).length} entries)`)
