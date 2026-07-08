// @vitest-environment happy-dom
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { _setChild, _setChildAt, bindPolymorphicText } from '../index'
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('universal VNode[] child helpers', () => {
  it('_setChild mounts a VNode array (param/return static case)', () => {
    const el = document.createElement('div')
    _setChild(el, [h('span', {}, 'A'), h('span', {}, 'B')])
    expect(el.textContent).toBe('AB')
    expect(el.querySelectorAll('span').length).toBe(2)
  })
  it('_setChild mounts a single VNode', () => {
    const el = document.createElement('div')
    _setChild(el, h('em', {}, 'X'))
    expect(el.querySelector('em')?.textContent).toBe('X')
  })
  it('_setChild text-sets a primitive unchanged (no regression)', () => {
    const el = document.createElement('div')
    _setChild(el, 'hello')
    expect(el.textContent).toBe('hello')
    expect(el.querySelector('span')).toBeNull()
  })
  it('_setChildAt mounts a VNode array at a placeholder (mixed content)', () => {
    const parent = document.createElement('div')
    parent.append(document.createTextNode('a'))
    const ph = document.createComment('slot'); parent.append(ph)
    parent.append(document.createTextNode('b'))
    _setChildAt(parent, ph, [h('i', {}, 'X'), h('i', {}, 'Y')])
    expect(parent.textContent).toBe('aXYb')
    expect(parent.contains(ph)).toBe(false)
  })
  it('bindPolymorphicText mounts a reactive VNode array (prop case, initial)', async () => {
    // Swap-teardown is a real-browser behavior (happy-dom does not replicate
    // reactive subtree cleanup) — verified in setchild-mount.browser.test.tsx.
    const items = signal<any>([h('li', {}, '1'), h('li', {}, '2')])
    const parent = document.createElement('ul')
    const tn = document.createTextNode(''); parent.append(tn)
    bindPolymorphicText(() => items(), tn, parent)
    await tick()
    expect(parent.querySelectorAll('li').length).toBe(2)
    expect(parent.textContent).toBe('12')
  })

  // ── edge cases ──────────────────────────────────────────────────────────
  it('_setChild mounts a MIXED array (VNodes interleaved with strings)', () => {
    const el = document.createElement('div')
    _setChild(el, [h('b', {}, 'X'), ' and ', h('b', {}, 'Y')])
    expect(el.textContent).toBe('X and Y')
    expect(el.querySelectorAll('b').length).toBe(2)
  })
  it('_setChild treats a primitive-only array as text (no VNode → no mount)', () => {
    const el = document.createElement('div')
    _setChild(el, [1, 2, 3])
    // `.some(_looksLikeVNode)` is false → falls to `textContent = arr` (Array
    // toString comma-joins), exactly as the historical text path did.
    expect(el.textContent).toBe('1,2,3')
    expect(el.children.length).toBe(0)
  })
  it('_setChild handles null/false/empty-array via the text path (no mount, no crash)', () => {
    // These all fall to `textContent = value` — the historical path, unchanged.
    // The exact coercion of `false`/`null` is DOM-impl-dependent (real browsers
    // stringify `false`→"false"; happy-dom yields ""), so assert only the
    // impl-independent invariant: nothing is MOUNTED and nothing throws.
    const el = document.createElement('div')
    _setChild(el, null)
    expect(el.children.length).toBe(0)
    _setChild(el, false)
    expect(el.children.length).toBe(0)
    _setChild(el, [])
    expect(el.textContent).toBe('') // empty array → '' (no VNode → text path)
    expect(el.children.length).toBe(0)
  })
})
