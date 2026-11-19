/**
 * Only a dimension that declares `multi` takes an ARRAY prop.
 *
 * The runtime marks a dimension multi when its object form has
 * `multi: true` (`getMultipleDimensions`). The type marked EVERY object form
 * multi, so a transform-only dimension (`{ propName, transform: true }`)
 * accepted `variant={['a', 'b']}`. Types are erased, so the contract is
 * asserted with `@ts-expect-error`: each directive fails the typecheck if the
 * line under it stops being an error.
 */
import { describe, expect, it } from 'vitest'
import type { DimensionValueObj, ExtractDimensionMulti } from '../types/dimensions'

describe('ExtractDimensionMulti', () => {
  it('is false for a transform-only dimension and for `multi: false`', () => {
    const transformOnly: ExtractDimensionMulti<{ readonly propName: 'variant'; readonly transform: true }> = false
    // @ts-expect-error — a transform-only dimension is single-value
    const notMulti: ExtractDimensionMulti<{ readonly propName: 'variant'; readonly transform: true }> = true
    const off: ExtractDimensionMulti<{ readonly propName: 'variant'; readonly multi: false }> = false
    const primitive: ExtractDimensionMulti<'state'> = false
    expect([transformOnly, notMulti, off, primitive]).toEqual([false, true, false, false])
  })

  it('is true for `multi: true` and for an un-narrowed `multi?: boolean`', () => {
    const multi: ExtractDimensionMulti<{ readonly propName: 'modifier'; readonly multi: true; readonly transform: true }> = true
    const wide: ExtractDimensionMulti<DimensionValueObj> = true
    expect([multi, wide]).toEqual([true, true])
  })
})
