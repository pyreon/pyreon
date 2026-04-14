import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(here, '..')

// Source-pattern regression test for the dev-mode warning gate. Pairs with
// the browser test in `runtime-dom.browser.test.ts` (which proves the gate
// fires in dev) — this asserts the gate is written using the pattern that
// Vite/Rolldown can literal-replace at build time, NOT the broken
// `typeof process` pattern that PR #200 cleaned up.
//
// Same shape as `flow/src/tests/integration.test.ts:warnIgnoredOptions`.
//
// The lint rule `pyreon/no-process-dev-gate` (introduced in PR #220) is the
// CI-wide enforcement for this. This test is the narrow, package-local
// safety net so a regression in runtime-dom is caught even if the lint
// configuration drifts.

const FILES_WITH_DEV_GATE = ['nodes.ts', 'hydration-debug.ts']

describe('runtime-dom dev-warning gate (source pattern)', () => {
  for (const file of FILES_WITH_DEV_GATE) {
    it(`${file} uses import.meta.env.DEV, not typeof process`, async () => {
      const source = await readFile(path.join(SRC, file), 'utf8')
      // Strip line + block comments so referencing the broken pattern in
      // documentation doesn't false-positive.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')

      // The gate constant must exist, defined via Vite's literal-replaced env.
      expect(code).toMatch(/const\s+__DEV__\s*=\s*import\.meta\.env\??\.DEV/)
      // The broken pattern must not appear anywhere in executable code.
      expect(code).not.toMatch(/typeof\s+process\s*!==?\s*['"]undefined['"]/)
    })
  }
})
