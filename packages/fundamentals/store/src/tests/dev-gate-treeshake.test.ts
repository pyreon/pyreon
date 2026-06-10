import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC_INDEX = path.resolve(here, '..', 'index.ts')
const LIB_INDEX = path.resolve(here, '..', '..', 'lib', 'index.js')

// Regression locks for the store dev-gate alias fix — the documented
// anti-pattern ("Local `__DEV__` const alias prevents bundler tree-shake",
// `.claude/rules/anti-patterns.md`):
//
//   const __DEV__ = process.env.NODE_ENV !== 'production'
//   ...
//   if (__DEV__) console.warn(...)
//
// looks identical to the bundler-agnostic bare gate but defeats the
// production define fold in esbuild and Bun.build (Vite/Rollup DOES fold
// through the alias — which is exactly why a Vite-bundle test cannot catch
// this defect; measured: a Vite prod bundle of the aliased source was
// clean while esbuild AND Bun.build bundles of the PUBLISHED lib/ shipped
// every dev-warning string + perf-counter name).
//
// Two locks at the two levels that matter:
//
//   1. SOURCE invariant (always runs): `index.ts` must not declare a
//      `__DEV__`-style alias — every dev gate is the inline bare
//      `process.env.NODE_ENV !== 'production'` per the repo convention.
//      The alias IS the defect, so this is the precise guard.
//
//   2. CONSUMER-shape functional check (runs when `lib/` is built — CI's
//      test job runs post-bootstrap so it always runs there; fresh
//      worktrees without lib skip with a message, the source invariant
//      still guards): esbuild-bundle the PUBLISHED lib entry with the
//      production define — the dev strings must be gone.

const DEV_STRINGS = [
  'Store plugin error for',
  'store.defineStore',
  'store.pluginRun',
  'store.subscribeNotify',
]

describe('store dev-gate — no tree-shake-defeating alias', () => {
  it('source declares NO __DEV__ alias (inline bare gates only)', () => {
    const src = readFileSync(SRC_INDEX, 'utf8')
    expect(
      /const\s+__DEV__/.test(src),
      'index.ts declares a `const __DEV__` alias — the documented anti-pattern that defeats esbuild/Bun.build production folds. Use the inline bare gate `process.env.NODE_ENV !== \'production\'` at every site.',
    ).toBe(false)
    // The gates themselves must still exist (a wholesale deletion of dev
    // diagnostics would also pass the alias check — guard against it).
    expect(src).toContain("process.env.NODE_ENV !== 'production'")
  })

  it.skipIf(!existsSync(LIB_INDEX))(
    'published lib → esbuild consumer bundle with production define drops dev strings',
    async () => {
      const out = await build({
        entryPoints: [LIB_INDEX],
        bundle: true,
        format: 'esm',
        minify: true,
        treeShaking: true,
        write: false,
        define: { 'process.env.NODE_ENV': '"production"' },
        external: ['@pyreon/*'],
      })
      const code = out.outputFiles[0]?.text ?? ''
      expect(code.length).toBeGreaterThan(0)
      for (const s of DEV_STRINGS) {
        expect(code, `"${s}" survived the esbuild production fold of lib/index.js`).not.toContain(s)
      }
    },
    20000,
  )

  it.skipIf(!existsSync(LIB_INDEX))(
    'published lib → dev-mode esbuild bundle PRESERVES dev strings (sanity)',
    async () => {
      const out = await build({
        entryPoints: [LIB_INDEX],
        bundle: true,
        format: 'esm',
        minify: false,
        write: false,
        define: { 'process.env.NODE_ENV': '"development"' },
        external: ['@pyreon/*'],
      })
      const code = out.outputFiles[0]?.text ?? ''
      for (const s of DEV_STRINGS) {
        expect(code, `"${s}" missing from dev bundle (did the diagnostics get deleted?)`).toContain(s)
      }
    },
    20000,
  )
})
