// @vitest-environment happy-dom
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { _tpl, _mountSlot } from '../template'
import { mount } from '../index'

describe('item2 runtime — _mountSlot with a static VNode array', () => {
  it('mounts each element (not [object Object])', () => {
    // The exact shape the compiler now emits for `const arr=[...]; <div>{arr}</div>`
    const arr = [h('span', { class: 'a' }, 'A'), h('span', { class: 'b' }, 'B')]
    const node = _tpl('<div class="wrap"><!></div>', (root: any) => {
      const p = root.firstChild
      const d = _mountSlot(arr, root, p)
      return () => d?.()
    })
    const c = document.createElement('div')
    mount(node as any, c)
    expect(c.querySelector('.wrap')?.textContent).toBe('AB')
    expect(c.querySelector('.a')?.textContent).toBe('A')
    expect(c.querySelector('.b')?.textContent).toBe('B')
    expect(c.textContent).not.toContain('[object Object]')
  })
})
