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
 * `afterEach` is IMPORTED from `vitest` — never read off `globalThis`. The
 * previous `globalThis.afterEach` guard silently registered NOTHING for
 * projects running without `globals: true` (the vitest default): containers
 * leaked across tests and surfaced as confusing "Found multiple elements"
 * failures (upstream report, 2026-07). The imported form works regardless of
 * the `globals` setting, and importing this module outside a vitest run fails
 * loudly at resolution instead of silently no-opping. Matcher registration is
 * likewise explicit `expect.extend` on bound imports — a bare side-effect
 * `import '@testing-library/jest-dom/vitest'` was tree-shaken out of the
 * built lib (`treeshake.moduleSideEffects: false`), see `./matchers`.
 */
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'
import { afterEach, expect } from 'vitest'
import { cleanup } from './cleanup'

expect.extend(jestDomMatchers)

afterEach(() => {
  cleanup()
})

// Type half of the matcher registration — declared in THIS entry too (each
// subpath is its own rolldown entry with its own d.ts; a consumer importing
// only `/vitest` must still get the matcher types). See `./matchers` for why
// this is a literal `declare module` and not a jest-dom/vitest import.
declare module 'vitest' {
  // vitest 5 moved the matcher surface onto `Matchers<R, T>` (which `Assertion`
  // and the asymmetric `expect.*` forms both extend) and gave `Assertion` a
  // second type parameter, so the v4-era `interface Assertion<T = any>`
  // augmentation no longer merges (TS2428). `R` is the matcher return type.
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown>
    extends TestingLibraryMatchers<unknown, R> {}
}
