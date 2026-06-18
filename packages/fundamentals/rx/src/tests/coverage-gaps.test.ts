// Normal-mode (__DEV__ true) + perf-counter sink installed: covers the
// `?.()` call-side of every `if (NODE_ENV !== 'production') __pyreon_count__?.()`
// gate across the transform helpers, for both signal and raw sources.
import { signal } from '@pyreon/reactivity'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sum } from '../aggregation'
import { filter, map } from '../collections'

beforeAll(() => {
  ;(globalThis as { __pyreon_count__?: (n: string) => void }).__pyreon_count__ = () => {}
})
afterAll(() => {
  delete (globalThis as { __pyreon_count__?: unknown }).__pyreon_count__
})

function exercise(): void {
  const sig = signal([1, 2, 3, 2])
  // signal sources
  filter(sig, (n) => n > 1)
  map(sig, (n) => n * 2)
  sum(sig)
  // raw sources
  filter([1, 2, 3], (n) => n > 1)
  map([1, 2, 3], (n) => n * 2)
  sum([1, 2, 3])
}

describe('rx — perf-counter call-sides (sink installed), signal + raw', () => {
  it('runs the transform surface with the counter sink active', () => {
    expect(() => exercise()).not.toThrow()
  })
})
