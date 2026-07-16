/**
 * `@pyreon/testing/matchers` — registers the jest-dom matchers with vitest's
 * `expect`. We register `@testing-library/jest-dom` (an optional peer) rather
 * than ship our own: it's the complete, battle-tested matcher set every
 * Testing-Library user already knows (`toBeInTheDocument`,
 * `toHaveTextContent`, `toBeVisible` with real visibility computation,
 * `toHaveAccessibleName`, `toBeChecked`, …), and it operates on the same real
 * DOM elements `render()` produces.
 *
 *   import '@pyreon/testing/matchers'   // side-effect: expect.extend
 *
 * Prefer the vitest entry when you want auto-cleanup too:
 *
 *   // vitest.config.ts
 *   test: { setupFiles: ['@pyreon/testing/vitest'] }
 *
 * Registration is EXPLICIT (`expect.extend` on bindings imported from
 * `vitest` + `@testing-library/jest-dom/matchers`) rather than a bare
 * side-effect `import '@testing-library/jest-dom/vitest'` — the library build
 * runs with `treeshake.moduleSideEffects: false`, which silently DROPPED the
 * bare import and shipped this module as an EMPTY file (upstream report,
 * 2026-07). Bound imports cannot be dropped. A missing `vitest` /
 * `@testing-library/jest-dom` also fails loudly at module resolution now,
 * instead of silently registering nothing.
 */
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'
import { expect } from 'vitest'

expect.extend(jestDomMatchers)

// Type half of the registration, declared HERE (mirroring jest-dom's own
// `./vitest` entry) rather than via `import '@testing-library/jest-dom/vitest'`
// — a bare/type-only import does not survive into the generated `lib/*.d.ts`,
// which shipped as an empty `export {}` and left consumers without the
// matcher types even after the runtime fix.
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors jest-dom's own vitest augmentation
  interface Assertion<T = any> extends TestingLibraryMatchers<unknown, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, unknown> {}
}
