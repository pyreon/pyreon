/**
 * `_fuse` — the runtime half of the compiler's text fusion. Its contract is a
 * lone `{x}` child's coercion, applied part by part, with ONE escape: any
 * non-text part hands back the parts array so the consumer mounts a subtree.
 * The end-to-end behaviour (adoption, SSR bytes, the VNode upgrade) is locked
 * in `@pyreon/runtime-dom`'s `text-fusion.test.tsx`; this locks the value
 * semantics of the helper itself, branch by branch.
 */
import { describe, expect, it } from 'vitest'
import { _fuse, h } from '../index'

describe('_fuse', () => {
  it('joins text-ish parts into one string', () => {
    expect(_fuse('Hello ', 'Ada', '!')).toBe('Hello Ada!')
    expect(_fuse(3, ' items')).toBe('3 items')
    expect(_fuse(1.5, true, 'x')).toBe('1.5truex')
  })

  it('null, undefined and false contribute nothing — exactly a lone {x}', () => {
    expect(_fuse(null, 'a', undefined, 'b', false)).toBe('ab')
    expect(_fuse(null, undefined, false)).toBe('')
    expect(_fuse()).toBe('')
    expect(_fuse(0, '')).toBe('0')
  })

  it('returns the PARTS ARRAY the moment a part is a VNode, array or function', () => {
    const v = h('b', null, 'X')
    const parts: unknown[] = ['Hello ', v, '!']
    expect(_fuse(...parts)).toEqual(parts)
    const arr = [h('i', null)]
    expect(_fuse(arr, 'tail')).toEqual([arr, 'tail'])
    const fn = () => 'late'
    expect(_fuse('a', fn)).toEqual(['a', fn])
  })

  it('keeps text-ish parts BEFORE the non-text part intact in the returned array', () => {
    const v = h('b', null)
    const out = _fuse(null, 'a', 2, v, false) as unknown[]
    expect(Array.isArray(out)).toBe(true)
    expect(out).toEqual([null, 'a', 2, v, false])
  })
})
