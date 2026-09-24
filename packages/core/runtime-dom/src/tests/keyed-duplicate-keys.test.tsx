/**
 * Duplicate keys — the second-commonest list mistake after a missing one.
 *
 * A key is a promise of uniqueness, and `id` is routinely derived from
 * something that is not unique: a date, a name, a foreign key, a paginated
 * fetch that overlaps by one row. The reconciler cannot honour the promise it
 * was given, so what matters is which way it fails: FIRST-WINS is the
 * documented rule, and the invariants around it are that the list stays the
 * right LENGTH, keeps its ORDER, keeps UPDATING, and tears down clean — a
 * duplicate must never strand a row, drop a legitimate one, or wedge the
 * reconciler's position bookkeeping so the NEXT update reorders the wrong
 * items.
 *
 * The suffix-anchored fast paths are where this bites hardest: they look up
 * the key at the boundary of an inserted run and move rows relative to it. A
 * duplicate means that key's cached entry may be somewhere else entirely, so
 * the path has to notice and decline rather than move a row to a stale anchor.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../index'

let container: HTMLElement
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  // The duplicate-key warning is the POINT of these shapes; silence it so a
  // suite that deliberately produces dozens is readable.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const text = () => container.textContent
const rows = () => container.querySelectorAll('li').length

// ─── Keyed ARRAY child (`{() => items.map(…)}`) ──────────────────────────────

describe('a keyed ARRAY with duplicate keys', () => {
  interface Item {
    k: number
    t: string
  }
  const render = (items: () => Item[]) =>
    h('ul', null, () => items().map((i) => h('li', { key: i.k }, i.t)))
  const at = (k: number, t = `t${k}`): Item => ({ k, t })

  it('renders a unique list, then grows it — the control', () => {
    const items = signal<Item[]>([at(1), at(2)])
    const dispose = mount(render(() => items()), container)
    expect(text()).toBe('t1t2')
    items.set([at(1), at(2), at(3)])
    expect(text()).toBe('t1t2t3')
    dispose()
  })

  it('keeps FIRST-WINS when a duplicate appears', () => {
    const items = signal<Item[]>([at(1, 'first'), at(1, 'second'), at(2)])
    const dispose = mount(render(() => items()), container)
    expect(rows(), 'the duplicate is not mounted twice').toBe(2)
    expect(text()).toBe('firstt2')
    dispose()
  })

  it('APPENDS past a duplicate without disturbing it', () => {
    // The contiguous-insertion fast path: the appended run sits after a
    // duplicate-bearing prefix, so its bookkeeping has to survive one key
    // appearing at two indices.
    const items = signal<Item[]>([at(1, 'a'), at(1, 'b')])
    const dispose = mount(render(() => items()), container)
    expect(text()).toBe('a')
    items.set([at(1, 'a'), at(1, 'b'), at(9, 'nine')])
    expect(text()).toBe('anine')
    expect(rows()).toBe(2)
    dispose()
  })

  it('INSERTS before a duplicated suffix key', () => {
    // The insertion path anchors on the key that follows the inserted run. If
    // that key is duplicated, its cached anchor may not be the row at that
    // position at all — the path has to decline rather than move a row to a
    // stale anchor.
    const items = signal<Item[]>([at(1), at(5, 'x'), at(5, 'y')])
    const dispose = mount(render(() => items()), container)
    expect(text()).toBe('t1x')
    items.set([at(1), at(3), at(5, 'x'), at(5, 'y')])
    expect(text()).toBe('t1t3x')
    dispose()
  })

  it('REORDERS a list containing a duplicate', () => {
    const items = signal<Item[]>([at(1, 'a'), at(2, 'b'), at(1, 'dup')])
    const dispose = mount(render(() => items()), container)
    expect(text()).toBe('ab')
    items.set([at(2, 'b'), at(1, 'a')])
    expect(text()).toBe('ba')
    dispose()
  })

  it('SHRINKS away the duplicated key entirely', () => {
    const items = signal<Item[]>([at(1, 'a'), at(1, 'dup'), at(2, 'b')])
    const dispose = mount(render(() => items()), container)
    items.set([at(2, 'b')])
    expect(text()).toBe('b')
    expect(rows()).toBe(1)
    dispose()
  })

  it('RESOLVES back to a unique list', () => {
    // The recovery path: the duplicate was a transient state (a fetch that
    // overlapped by one row, then reconciled).
    const items = signal<Item[]>([at(1, 'a'), at(1, 'dup'), at(2, 'b')])
    const dispose = mount(render(() => items()), container)
    items.set([at(1, 'a'), at(2, 'b'), at(3, 'c')])
    expect(text()).toBe('abc')
    expect(rows()).toBe(3)
    dispose()
  })

  it('stays LIVE after a duplicate has been through it', () => {
    const items = signal<Item[]>([at(1, 'a'), at(1, 'dup')])
    const dispose = mount(render(() => items()), container)
    items.set([at(7, 'seven')])
    expect(text()).toBe('seven')
    items.set([at(7, 'seven'), at(8, 'eight')])
    expect(text()).toBe('seveneight')
    dispose()
  })

  it('tears down clean from a duplicated state', () => {
    const items = signal<Item[]>([at(1, 'a'), at(1, 'dup'), at(2, 'b')])
    const dispose = mount(render(() => items()), container)
    dispose()
    expect(rows(), 'nothing stranded').toBe(0)
  })

  it('survives EVERY key being the same', () => {
    // The degenerate end of the class — a list keyed on a constant.
    const items = signal<Item[]>([at(1, 'a'), at(1, 'b'), at(1, 'c')])
    const dispose = mount(render(() => items()), container)
    expect(rows()).toBe(1)
    expect(text()).toBe('a')
    items.set([at(1, 'a'), at(1, 'b')])
    expect(rows()).toBe(1)
    dispose()
  })
})

// ─── <For> over a source array ───────────────────────────────────────────────

describe('a <For> whose `by` returns duplicate keys', () => {
  interface Row {
    id: number
    t: string
  }
  const app = (src: () => Row[]) =>
    h(
      'ul',
      null,
      h(For, {
        each: () => src(),
        by: (r: Row) => r.id,
        children: (r: Row) => h('li', null, r.t),
      }),
    )
  const row = (id: number, t = `t${id}`): Row => ({ id, t })

  it('renders a unique source — the control', () => {
    const src = signal<Row[]>([row(1), row(2)])
    const dispose = mount(app(() => src()), container)
    expect(text()).toBe('t1t2')
    dispose()
  })

  it('keeps FIRST-WINS for a duplicated id', () => {
    const src = signal<Row[]>([row(1, 'a'), row(1, 'b'), row(2)])
    const dispose = mount(app(() => src()), container)
    expect(rows()).toBe(2)
    expect(text()).toBe('at2')
    dispose()
  })

  it('APPENDS past a duplicate', () => {
    const src = signal<Row[]>([row(1, 'a'), row(1, 'b')])
    const dispose = mount(app(() => src()), container)
    src.set([row(1, 'a'), row(1, 'b'), row(9, 'nine')])
    expect(text()).toBe('anine')
    dispose()
  })

  it('INSERTS before a duplicated suffix key', () => {
    const src = signal<Row[]>([row(1), row(5, 'x'), row(5, 'y')])
    const dispose = mount(app(() => src()), container)
    src.set([row(1), row(3), row(5, 'x'), row(5, 'y')])
    expect(text()).toBe('t1t3x')
    dispose()
  })

  it('REORDERS around a duplicate', () => {
    const src = signal<Row[]>([row(1, 'a'), row(2, 'b'), row(3, 'c'), row(1, 'dup')])
    const dispose = mount(app(() => src()), container)
    expect(text()).toBe('abc')
    src.set([row(3, 'c'), row(1, 'a'), row(2, 'b')])
    expect(text()).toBe('cab')
    dispose()
  })

  it('CLEARS from a duplicated state', () => {
    const src = signal<Row[]>([row(1, 'a'), row(1, 'dup')])
    const dispose = mount(app(() => src()), container)
    src.set([])
    expect(rows()).toBe(0)
    src.set([row(4, 'four')])
    expect(text(), 'and refills').toBe('four')
    dispose()
  })

  it('REPLACES a duplicated list wholesale', () => {
    const src = signal<Row[]>([row(1, 'a'), row(1, 'dup'), row(2, 'b')])
    const dispose = mount(app(() => src()), container)
    src.set([row(7, 'x'), row(8, 'y')])
    expect(text()).toBe('xy')
    expect(rows()).toBe(2)
    dispose()
  })

  it('tears down clean from a duplicated state', () => {
    const src = signal<Row[]>([row(1, 'a'), row(1, 'dup'), row(2, 'b')])
    const dispose = mount(app(() => src()), container)
    dispose()
    expect(rows()).toBe(0)
  })
})
