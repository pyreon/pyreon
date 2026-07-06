/**
 * `@pyreon/testing/vitest` — a `setupFiles` entry that wires the two things
 * every Pyreon test suite wants:
 *
 *   // vitest.config.ts
 *   test: { setupFiles: ['@pyreon/testing/vitest'] }
 *
 *   1. `afterEach(cleanup)` — rendered trees are torn down between tests with
 *      no manual call.
 *   2. the `@testing-library/jest-dom` matchers extended onto `expect`.
 *
 * Guards each global so importing it outside a vitest context is a no-op.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from './cleanup'

const g = globalThis as { afterEach?: (fn: () => void) => void }
if (typeof g.afterEach === 'function') {
  g.afterEach(() => cleanup())
}
