/**
 * Coverage edge tests — exercises the WeakMap fallback cache hit path
 * in `createStyledComponent` (alternating same-strings + different-tag
 * pattern) plus the Proxy guards on `styled.<tag>`.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { sheet } from '../sheet'
import { styled } from '../styled'

afterEach(() => {
  sheet.reset()
})

describe('createStyledComponent — WeakMap fallback cache', () => {
  it('alternating tag with same strings re-uses the cached component via WeakMap', () => {
    // First call: populate the hot-cache (strings, tag=div)
    const tplStrings = Object.assign(['display: flex;\n'], { raw: ['display: flex;\n'] }) as unknown as TemplateStringsArray
    const A = (styled as any)('div')(tplStrings)
    expect(typeof A).toBe('function')

    // Second call: same strings but different tag → hot-cache MISS,
    // populates the WeakMap entry for `strings` with `span`.
    const B = (styled as any)('span')(tplStrings)
    expect(typeof B).toBe('function')

    // Third call: back to `div`, same strings → hot-cache MISS (tag !==),
    // BUT WeakMap fallback finds the prior `div` entry → returns cached A.
    const A2 = (styled as any)('div')(tplStrings)
    expect(A2).toBe(A)
  })
})

describe('styled Proxy — prototype + Symbol guards', () => {
  it("returns undefined for 'prototype' access", () => {
    expect((styled as unknown as Record<string, unknown>).prototype).toBeUndefined()
  })

  it("returns undefined for '$$typeof' access", () => {
    expect((styled as unknown as Record<string, unknown>).$$typeof).toBeUndefined()
  })

  it('caches the tag-template factory per tag (same call returns same fn)', () => {
    const divFn1 = styled.div
    const divFn2 = styled.div
    expect(divFn1).toBe(divFn2)
  })
})
