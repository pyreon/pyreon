/**
 * `@pyreon/testing/matchers` — side-effect entry that registers the jest-dom-
 * style matchers with vitest's `expect`. Add to your test's imports:
 *
 *   import '@pyreon/testing/matchers'
 *
 * or a vitest `setupFiles` entry. Falls back gracefully (no-op) when a global
 * `expect.extend` isn't present, so importing it outside a test runner won't
 * throw.
 */
import { pyreonDomMatchers } from './matchers'

interface ExtendableExpect {
  extend: (matchers: Record<string, unknown>) => void
}

const maybeExpect = (globalThis as { expect?: ExtendableExpect }).expect
if (maybeExpect && typeof maybeExpect.extend === 'function') {
  maybeExpect.extend(pyreonDomMatchers)
}

export { pyreonDomMatchers } from './matchers'
export type { PyreonDomMatchers } from './matchers'
