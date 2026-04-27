import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(here, '..')

// Source-pattern regression test for the dev-mode warning gate. Pairs with
// the browser test in `runtime-dom.browser.test.ts` (which proves the gate
// fires in dev) — this asserts the gate is written using the bundler-agnostic
// pattern (`process.env.NODE_ENV !== 'production'`) that every modern bundler
// (Vite, Webpack/Next.js, esbuild, Rollup, Parcel, Bun) literal-replaces at
// consumer build time. The two previously-shipped broken patterns must not
// appear:
//   1. `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'`
//      — dead in Vite browser bundles.
//   2. `import.meta.env.DEV` — Vite/Rolldown-only; undefined and silent in
//      Webpack/Next.js, esbuild, Rollup, Parcel, Bun.
//
// Same shape as `flow/src/tests/integration.test.ts:warnIgnoredOptions`.
//
// The lint rule `pyreon/no-process-dev-gate` is the CI-wide enforcement for
// this. This test is the narrow, package-local safety net so a regression in
// runtime-dom is caught even if the lint configuration drifts.

const FILES_WITH_DEV_GATE = ['nodes.ts', 'hydration-debug.ts']

describe('runtime-dom dev-warning gate (source pattern)', () => {
  for (const file of FILES_WITH_DEV_GATE) {
    it(`${file} uses bundler-agnostic process.env.NODE_ENV`, async () => {
      const source = await readFile(path.join(SRC, file), 'utf8')
      // Strip line + block comments so referencing the broken pattern in
      // documentation doesn't false-positive.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')

      // The bundler-agnostic gate must appear (bare `process.env.NODE_ENV`).
      expect(code).toMatch(/process\.env\.NODE_ENV/)
      // Neither broken pattern may appear in executable code.
      expect(code).not.toMatch(/typeof\s+process\s*!==?\s*['"]undefined['"]/)
      expect(code).not.toMatch(/import\.meta\.env\??\.DEV/)
    })
  }
})
