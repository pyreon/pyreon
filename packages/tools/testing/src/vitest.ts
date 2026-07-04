/**
 * `@pyreon/testing/vitest` — a setup-file entry that wires the auto-cleanup +
 * DOM matchers into vitest. Add to your `vitest.config.ts`:
 *
 *   test: { setupFiles: ['@pyreon/testing/vitest'] }
 *
 * It registers `afterEach(cleanup)` (so rendered trees are torn down between
 * tests without a manual call) and extends `expect` with the jest-dom-style
 * matchers. Guards each global so importing it outside a vitest context is a
 * no-op rather than a throw.
 */
import { cleanup } from './cleanup'
import { pyreonDomMatchers } from './matchers'

interface TestGlobals {
  afterEach?: (fn: () => void) => void
  expect?: { extend: (m: Record<string, unknown>) => void }
}

const g = globalThis as TestGlobals

if (typeof g.afterEach === 'function') {
  g.afterEach(() => cleanup())
}

if (g.expect && typeof g.expect.extend === 'function') {
  g.expect.extend(pyreonDomMatchers)
}
