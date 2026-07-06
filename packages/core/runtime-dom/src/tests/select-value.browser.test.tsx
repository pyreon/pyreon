/**
 * `<select value>` binding — real-Chromium belt-and-braces (PZ-09).
 *
 * The happy-dom matrix lives in select-value.test.tsx (happy-dom's four
 * select semantics were verified faithful to real browsers). This smoke
 * locks the two load-bearing cells against REAL Chromium:
 *   1. the compiler's deferred emission shape (value bind AFTER the
 *      children `_mountSlot`) selects the initial value with DYNAMIC options;
 *   2. the h() path (mountElement applying value after mountChildren).
 * Written with `h()` / the emitted runtime shape directly — runtime-dom's
 * tsconfig uses `jsx: preserve` (the convention for browser tests here).
 */
import { h } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { _bindDirect, _mountSlot, _tpl } from '@pyreon/runtime-dom'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'

describe('<select value> — real Chromium', () => {
  it('deferred template emission: initial value survives dynamic options; updates track', async () => {
    const sig = signal('b')
    const items = ['a', 'b', 'c']
    // The exact post-fix compiler emission for
    //   <select value={() => sig()}>{items.map(i => <option value={i}>{i}</option>)}</select>
    // — `_mountSlot` line BEFORE the deferred `_bindDirect` line.
    const node = _tpl('<select><!></select>', (root) => {
      const __p0 = root.firstChild as Node
      const __d1 = _mountSlot(
        () => items.map((i) => h('option', { value: i }, i)),
        root,
        __p0,
      )
      const __d0 = _bindDirect(sig, (v) => {
        ;(root as HTMLSelectElement).value = v as string
      })
      return () => {
        __d0()
        __d1()
      }
    })
    const { container, unmount } = mountInBrowser(node as unknown as VNodeChild)
    await flush()

    const select = container.querySelector('select') as HTMLSelectElement
    expect(select.options.length).toBe(3)
    expect(select.value).toBe('b') // the pre-fix order dropped this initial
    sig.set('c')
    await flush()
    expect(select.value).toBe('c')
    unmount()
  })

  it('h() path: static + reactive value apply after children', async () => {
    const sig = signal('b')
    const vnode = h(
      'div',
      null,
      h('select', { id: 's1', value: 'b' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')),
      h(
        'select',
        { id: 's2', value: () => sig() },
        h('option', { value: 'a' }, 'A'),
        h('option', { value: 'b' }, 'B'),
        h('option', { value: 'c' }, 'C'),
      ),
    )
    const { container, unmount } = mountInBrowser(vnode)
    await flush()

    expect((container.querySelector('#s1') as HTMLSelectElement).value).toBe('b')
    const s2 = container.querySelector('#s2') as HTMLSelectElement
    expect(s2.value).toBe('b')
    sig.set('c')
    await flush()
    expect(s2.value).toBe('c')
    unmount()
  })
})
