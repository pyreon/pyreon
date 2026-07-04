/**
 * `cleanup()` — unmount every tree rendered via `render()` and clear the
 * containers. Mirrors `@testing-library/react`: auto-registered in an
 * `afterEach` hook when a test runner exposes one (see `./vitest`), or
 * called manually.
 *
 * Idempotent and order-independent: iterates a snapshot of the live set so a
 * result removing itself mid-iteration can't skip a sibling.
 */
import { _mountedResults } from './render'

export function cleanup(): void {
  for (const result of Array.from(_mountedResults())) {
    result.unmount()
  }
}
