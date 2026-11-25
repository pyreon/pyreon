/**
 * Real-browser proof (Chromium; WebKit and Firefox via the engines config) that a keyed `.map()` row compiled as ONE template with
 * its key on the item (`_tpl(html, bind, 1, row.id)`, see
 * `fixtures/keyed-root.fixture.tsx`) is reconciled by key: a reorder MOVES the
 * live row nodes, so a typed value (and, where `moveBefore` exists, focus) survives it, and a removal takes
 * exactly the removed row. The node-level matrix (emit, clones, hydration, key
 * readers) is `keyed-root-template.test.tsx`.
 *
 * Bisect-verified (2026-11-24): with the item's key dropped
 * (`RemountableItem.key = null`), the list takes the unkeyed path and re-creates
 * every row on each change: both specs fail on node identity (the moved row's
 * `<input>` is a new element; the kept rows are new `<tr>`s). Restored → 2/2.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { flush } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from 'vitest/browser'
import { KeyedTable, type KeyedRow } from './fixtures/keyed-root.fixture'

const hasMoveBefore = typeof (Element.prototype as { moveBefore?: unknown }).moveBefore === 'function'
const cleanups: (() => void)[] = []

afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

const mk = (id: number): KeyedRow => ({
  id,
  label: signal(`row ${id}`),
  done: signal(id % 2 === 0),
})

function render(n: number) {
  const rows = signal<KeyedRow[]>(Array.from({ length: n }, (_, i) => mk(i + 1)))
  const container = document.createElement('div')
  document.body.appendChild(container)
  const unmount = mount(h(KeyedTable, { rows }), container)
  cleanups.push(() => {
    unmount()
    container.remove()
  })
  const trs = () => [...container.querySelectorAll('tr')]

  return { rows, container, trs }
}

describe('keyed .map() rows compiled as one template (real browsers)', () => {
  it.runIf(server.browser === 'chromium')('Chromium has moveBefore (so the focus assertion runs)', () => {
    expect(hasMoveBefore).toBe(true)
  })

  it('a reorder moves the live rows: focus and a typed value survive', async () => {
    const { rows, trs } = render(4)
    const input = trs()[0]!.querySelector('input')!
    input.focus()
    input.value = 'typed'
    const r = rows.peek()
    rows.set([r[1]!, r[2]!, r[3]!, r[0]!])
    await flush()
    expect(trs()[3]!.querySelector('input')).toBe(input)
    expect(input.value).toBe('typed')
    // Focus survives a move only where `moveBefore` exists (Chromium; WebKit
    // does not ship it — see for-move-preserves-state.browser.test.tsx).
    if (hasMoveBefore) expect(document.activeElement).toBe(input)
  })

  it('removal and append touch only their own rows; cells stay live', async () => {
    const { rows, trs, container } = render(5)
    const before = trs()
    rows.set(rows.peek().filter((x) => x.id !== 3))
    rows.set([...rows.peek(), mk(6)])
    await flush()
    const after = trs()
    expect(after.slice(0, 4)).toEqual([before[0], before[1], before[3], before[4]])
    expect(after[4]!.querySelector('.id')!.textContent).toBe('6')
    rows.peek()[0]!.done.set(true)
    await flush()
    expect(container.querySelectorAll('span')).toHaveLength(4) // ids 1, 2, 4, 6
    expect(after[0]!.namespaceURI).toBe('http://www.w3.org/1999/xhtml')
  })
})
