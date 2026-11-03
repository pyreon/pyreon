// A frozen (or otherwise read-only) earlier source must not make a later override throw.
//
// `mergeProps` copies a source's descriptor, so a frozen object's key arrives on the result as a NON-writable data
// property. A later source overriding that key took the plain-assignment fast path, which throws in strict mode
// ("Cannot assign to read only property"). Frozen default-props objects are common (`Object.freeze(DEFAULTS)`), and
// rocketstyle / Element merge through the same helper on every render.

import { describe, expect, it } from 'vitest'
import { _mergePropsExcept, _mergePropsOmit, mergeProps } from '../props'

const DEFAULTS = Object.freeze({ size: 'md', tone: 'neutral' })

describe('merging over a read-only earlier source', () => {
  it('mergeProps: a later value overrides a frozen default', () => {
    const merged = mergeProps(DEFAULTS as Record<string, unknown>, { size: 'lg' })
    expect(merged.size).toBe('lg')
    expect(merged.tone).toBe('neutral')
  })

  it('mergeProps: a non-writable (not frozen) earlier key is overridden too', () => {
    const first = {} as Record<string, unknown>
    Object.defineProperty(first, 'size', { value: 'md', enumerable: true, writable: false })
    expect(mergeProps(first, { size: 'lg' }).size).toBe('lg')
  })

  it('mergeProps: an undefined later value still keeps the frozen default', () => {
    expect(mergeProps(DEFAULTS as Record<string, unknown>, { size: undefined }).size).toBe('md')
  })

  it('_mergePropsOmit and _mergePropsExcept share the fix', () => {
    const omitted = _mergePropsOmit(new Set(['tone']), DEFAULTS as Record<string, unknown>, { size: 'lg' })
    expect(omitted.size).toBe('lg')
    expect('tone' in omitted).toBe(false)
    const except = _mergePropsExcept(new Set(['tone']), DEFAULTS as Record<string, unknown>, { size: 'lg' })
    expect(except.size).toBe('lg')
  })

  it('a frozen default does not freeze the merged result', () => {
    const merged = mergeProps(DEFAULTS as Record<string, unknown>, { size: 'lg' })
    expect(Object.isFrozen(merged)).toBe(false)
  })
})
