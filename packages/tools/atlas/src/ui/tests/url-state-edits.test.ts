import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { editedArgs, isLinkable } from '../url-state'

/**
 * Only the EDITS travel in a link. A scenario's args are the whole pinned
 * state — a Tree's `data`, an authored render-prop child — and a URL carrying
 * all of it is not one anyone pastes; a URL carrying a function is not one
 * that can exist.
 */
describe('isLinkable', () => {
  it('accepts JSON values, nested', () => {
    expect(isLinkable('x')).toBe(true)
    expect(isLinkable(3)).toBe(true)
    expect(isLinkable(null)).toBe(true)
    expect(isLinkable({ a: [1, { b: 'c' }] })).toBe(true)
  })

  it('rejects a function and a symbol', () => {
    expect(isLinkable(() => 1)).toBe(false)
    expect(isLinkable(Symbol('s'))).toBe(false)
    expect(isLinkable({ children: () => 1 })).toBe(false)
    expect(isLinkable([1, () => 1])).toBe(false)
  })

  it('rejects a vnode — `{ type, props, children[] }` as h() builds it, tag string included', () => {
    expect(isLinkable(h('div', {}, 'x'))).toBe(false)
    expect(isLinkable(h(() => 'c', {}))).toBe(false)
    expect(isLinkable({ data: [h('li', {}, 'x')] })).toBe(false)
    // An object that merely HAS a `type` string is data, not a vnode.
    expect(isLinkable({ type: 'button', props: {} })).toBe(true)
  })
})

describe('editedArgs', () => {
  const base = { label: 'Save', size: 'medium', data: [{ id: 1 }] }

  it('returns nothing when nothing was edited', () => {
    expect(editedArgs(undefined, base)).toEqual({})
    expect(editedArgs({ ...base }, base)).toEqual({})
  })

  it('returns only the keys that differ, compared structurally', () => {
    expect(editedArgs({ ...base, size: 'large' }, base)).toEqual({ size: 'large' })
    expect(editedArgs({ ...base, data: [{ id: 1 }] }, base)).toEqual({})
    expect(editedArgs({ ...base, data: [{ id: 2 }] }, base)).toEqual({ data: [{ id: 2 }] })
  })

  it('keeps a key the base does not have', () => {
    expect(editedArgs({ ...base, extra: 1 }, base)).toEqual({ extra: 1 })
  })

  it('drops what a link cannot carry, even when it differs', () => {
    expect(editedArgs({ ...base, children: () => 'x', size: 'large' }, base)).toEqual({ size: 'large' })
  })
})
