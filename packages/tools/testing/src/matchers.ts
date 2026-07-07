/**
 * `@pyreon/testing/matchers` — registers the jest-dom matchers with the test
 * runner's `expect`. We re-export `@testing-library/jest-dom` (an optional
 * peer) rather than ship our own: it's the complete, battle-tested matcher set
 * every Testing-Library user already knows (`toBeInTheDocument`,
 * `toHaveTextContent`, `toBeVisible` with real visibility computation,
 * `toHaveAccessibleName`, `toBeChecked`, …), and it operates on the same real
 * DOM elements `render()` produces.
 *
 *   import '@pyreon/testing/matchers'   // side-effect: expect.extend
 *
 * Prefer the vitest entry when you use vitest — it also wires auto-cleanup:
 *
 *   // vitest.config.ts
 *   test: { setupFiles: ['@pyreon/testing/vitest'] }
 */
import '@testing-library/jest-dom/vitest'
