/**
 * A reactive update that arrives after the DOM was torn down by someone else.
 *
 * Framework teardown is orderly; the DOM is not owned exclusively. A router
 * that swaps `innerHTML`, a third-party widget that replaces a subtree, a
 * modal library that empties its host, a test harness resetting between cases —
 * all of them can remove the nodes a live binding is anchored to while that
 * binding is still subscribed. The signal write that follows is then aimed at
 * markers with no parent.
 *
 * The only acceptable outcome is that it does NOTHING: no throw (an unhandled
 * effect error takes every other subscriber on that signal down with it), and
 * no re-mount into a detached tree, which would resurrect content the user
 * already navigated away from and leak it for as long as the signal lives.
 */
import { For, h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../index'
import { query } from '@pyreon/test-utils'

let container: HTMLElement
let errors: string[]
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  errors = []
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errors.push(a.map((x) => String(x)).join(' '))
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/** Someone else emptied the host — the shape a router swap leaves behind. */
const wipe = () => {
  container.innerHTML = ''
}

describe('a <For> whose markers were removed from underneath it', () => {
  interface Row {
    id: number
  }
  const app = (rows: () => Row[]) =>
    h(
      'div',
      { class: 'host' },
      h(For, {
        each: () => rows(),
        by: (r: Row) => r.id,
        children: (r: Row) => h('b', { class: 'row' }, `r${r.id}`),
      }),
    )

  it('updates normally while it is attached — the control', () => {
    const rows = signal<Row[]>([{ id: 1 }])
    const dispose = mount(app(() => rows()), container)
    rows.set([{ id: 1 }, { id: 2 }])
    expect(container.textContent).toBe('r1r2')
    dispose()
  })

  it('does not THROW on an update after the wipe', () => {
    // An unhandled effect error here is not scoped to this list: it surfaces
    // as a console error from a write the caller made for some other reason,
    // and it aborts that write's remaining subscribers.
    const rows = signal<Row[]>([{ id: 1 }])
    const dispose = mount(app(() => rows()), container)
    wipe()
    expect(() => rows.set([{ id: 1 }, { id: 2 }])).not.toThrow()
    expect(errors.join('\n'), 'and nothing was reported').not.toMatch(/effect error/i)
    dispose()
  })

  it('does not RE-MOUNT into the detached tree', () => {
    // Resurrecting rows into DOM nobody is looking at leaks every row and its
    // subscriptions for as long as the signal lives.
    const rows = signal<Row[]>([{ id: 1 }])
    const dispose = mount(app(() => rows()), container)
    wipe()
    rows.set([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(container.querySelectorAll('.row'), 'the host stays empty').toHaveLength(0)
    dispose()
  })

  it('survives a CLEAR after the wipe', () => {
    const rows = signal<Row[]>([{ id: 1 }, { id: 2 }])
    const dispose = mount(app(() => rows()), container)
    wipe()
    expect(() => rows.set([])).not.toThrow()
    dispose()
  })

  it('survives a REORDER after the wipe', () => {
    const rows = signal<Row[]>([{ id: 1 }, { id: 2 }, { id: 3 }])
    const dispose = mount(app(() => rows()), container)
    wipe()
    expect(() => rows.set([{ id: 3 }, { id: 1 }, { id: 2 }])).not.toThrow()
    dispose()
  })

  it('disposes cleanly afterwards', () => {
    const rows = signal<Row[]>([{ id: 1 }])
    const dispose = mount(app(() => rows()), container)
    wipe()
    rows.set([{ id: 2 }])
    expect(() => dispose()).not.toThrow()
  })
})

describe('a keyed ARRAY whose markers were removed from underneath it', () => {
  const render = (items: () => number[]) =>
    h('ul', { class: 'host' }, () => items().map((i) => h('li', { key: i }, `t${i}`)))

  it('updates normally while attached — the control', () => {
    const items = signal([1])
    const dispose = mount(render(() => items()), container)
    items.set([1, 2])
    expect(container.textContent).toBe('t1t2')
    dispose()
  })

  it('does not throw or re-mount after the wipe', () => {
    const items = signal([1])
    const dispose = mount(render(() => items()), container)
    wipe()
    expect(() => items.set([1, 2, 3])).not.toThrow()
    expect(container.querySelectorAll('li')).toHaveLength(0)
    dispose()
  })

  it('survives going EMPTY after the wipe', () => {
    const items = signal([1, 2])
    const dispose = mount(render(() => items()), container)
    wipe()
    expect(() => items.set([])).not.toThrow()
    dispose()
  })
})

describe('a reactive TEXT binding whose node was removed from underneath it', () => {
  it('updates normally while attached — the control', () => {
    const v = signal('a')
    const dispose = mount(h('p', { class: 'host' }, () => v()), container)
    v.set('b')
    expect(container.textContent).toBe('b')
    dispose()
  })

  it('does not throw after the wipe', () => {
    const v = signal('a')
    const dispose = mount(h('p', { class: 'host' }, () => v()), container)
    wipe()
    expect(() => v.set('b')).not.toThrow()
    expect(container.textContent).toBe('')
    dispose()
  })

  it('does not throw when the accessor changes SHAPE after the wipe', () => {
    // Text to subtree is the polymorphic upgrade — a different code path, and
    // the one that actually inserts nodes rather than writing `.data`.
    const v = signal<string | VNode>('a')
    const dispose = mount(h('p', { class: 'host' }, () => v()), container)
    wipe()
    expect(() => v.set(h('em', { class: 'up' }, 'x'))).not.toThrow()
    expect(container.querySelector('.up')).toBeNull()
    dispose()
  })
})

describe('a reactive ATTRIBUTE binding whose element was removed', () => {
  it('updates normally while attached — the control', () => {
    const cls = signal('a')
    const dispose = mount(h('p', { class: () => cls() }, 'x'), container)
    expect(container.querySelector('.a')).not.toBeNull()
    cls.set('b')
    expect(container.querySelector('.b')).not.toBeNull()
    dispose()
  })

  it('does not throw after the element was removed', () => {
    // The element is detached but not disposed, so the binding is still
    // subscribed and still writes — to a node nobody can see. That must be
    // harmless, because there is no way for the framework to know the removal
    // happened.
    const cls = signal('a')
    const dispose = mount(h('p', { class: () => cls() }, 'x'), container)
    const el = query(container, 'p')
    el.remove()
    expect(() => cls.set('b')).not.toThrow()
    expect(el.className, 'it still wrote, to the detached node').toBe('b')
    dispose()
  })
})
