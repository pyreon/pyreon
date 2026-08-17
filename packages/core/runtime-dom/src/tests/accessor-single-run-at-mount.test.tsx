// Regression lock: a TEXTISH reactive accessor child runs EXACTLY ONCE at
// mount (the classification call IS the subscription-establishing tracked
// run — mountAccessorChild in mount.ts). Historically mountChild ran every
// function child twice: an untracked classification sample + the binding
// machinery's own tracked first run (~12k invocations for 6k reactive cells
// in the @pyreon/table bench, PR #2881's finding).
//
// The STRUCTURAL (keyed-array / general VNode / null-initial) branches
// deliberately KEEP the historical 2-invocations-at-mount shape: they hand
// off to mountKeyedList / mountReactive, whose effect()-grade semantics
// (ErrorBoundary routing, onUpdate notify, re-entrant generation guard) a
// renderEffect-flavored dispatcher cannot replicate. Those assertions lock
// the RESIDUAL honestly — if a future change gets them to 1 with semantics
// intact, update them downward, never upward.
//
// Bisect-verified: reverting mountChild to the sample-then-dispatch shape
// fails the `toBe(1)` specs with `expected 2 to be 1`.
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { mount } from '../index'

function counted<T>(fn: () => T): { calls: () => number; acc: () => T } {
  let n = 0
  return {
    calls: () => n,
    acc: () => {
      n++
      return fn()
    },
  }
}

describe('single accessor invocation at mount (textish shapes)', () => {
  it('plain reactive text child runs ONCE at mount and stays reactive', () => {
    const s = signal('a')
    const c = counted(() => s())
    const el = document.createElement('div')
    const dispose = mount(() => h('div', null, c.acc), el)
    expect(c.calls()).toBe(1)
    expect(el.textContent).toBe('a')
    // The single call must have established the subscription.
    s.set('b')
    expect(c.calls()).toBe(2)
    expect(el.textContent).toBe('b')
    dispose()
  })

  it('number and boolean initials run ONCE', () => {
    const n = signal(41)
    const cn = counted(() => n())
    const b = signal(false)
    const cb = counted(() => b())
    const el = document.createElement('div')
    const dispose = mount(() => h('div', null, cn.acc, cb.acc), el)
    expect(cn.calls()).toBe(1)
    expect(cb.calls()).toBe(1)
    expect(el.textContent).toBe('41')
    n.set(42)
    expect(el.textContent).toBe('42')
    dispose()
  })

  it('component-child accessor runs ONCE at mount', () => {
    const s = signal('x')
    const c = counted(() => s())
    const Comp = (props: { children?: unknown }) => h('section', null, props.children as never)
    const el = document.createElement('div')
    const dispose = mount(() => h(Comp as never, null, c.acc as never), el)
    expect(c.calls()).toBe(1)
    expect(el.textContent).toBe('x')
    s.set('y')
    expect(el.textContent).toBe('y')
    dispose()
  })

  it('For-row cell accessors run ONCE per cell at mount', () => {
    const rows = signal([0, 1, 2])
    let cellCalls = 0
    const el = document.createElement('div')
    const dispose = mount(
      () =>
        h(
          'ul',
          null,
          h(For as never, {
            each: () => rows(),
            by: (r: number) => r,
            children: (r: number) =>
              h('li', null, () => {
                cellCalls++
                return `cell-${r}`
              }),
          } as never),
        ),
      el,
    )
    expect(cellCalls).toBe(3)
    expect(el.textContent).toBe('cell-0cell-1cell-2')
    dispose()
  })

  it('textish-first accessor still UPGRADES to a subtree on a later VNode value', () => {
    const s = signal<'text' | 'vnode'>('text')
    const c = counted(() => (s() === 'text' ? 'plain' : h('b', null, 'bold')))
    const el = document.createElement('div')
    const dispose = mount(() => h('div', null, c.acc as never), el)
    expect(c.calls()).toBe(1)
    expect(el.textContent).toBe('plain')
    s.set('vnode')
    expect(el.querySelector('b')?.textContent).toBe('bold')
    s.set('text')
    expect(el.querySelector('b')).toBeNull()
    expect(el.textContent).toBe('plain')
    dispose()
  })

  it('an accessor that throws at mount does not leak its partial subscription', () => {
    // The throw propagates synchronously out of mountChild (same surface as
    // the old untracked sample's throw) and is caught by the component-mount
    // error path — what THIS spec locks is that the dispatcher was disposed
    // before the rethrow, so the partially-collected subscription is dropped.
    const s = signal('a')
    let calls = 0
    const el = document.createElement('div')
    mount(
      () =>
        h('div', null, () => {
          calls++
          s()
          throw new Error('boom')
        }),
      el,
    )
    expect(calls).toBe(1)
    // A later write must not re-invoke the accessor through a leaked
    // subscription.
    s.set('b')
    expect(calls).toBe(1)
  })
})

describe('structural shapes keep the documented 2-invocation handoff', () => {
  it('general (conditional VNode) accessor: 2 at mount, reactive after', () => {
    const s = signal(true)
    const c = counted(() => (s() ? h('b', null, 'x') : null))
    const el = document.createElement('div')
    const dispose = mount(() => h('div', null, c.acc as never), el)
    expect(c.calls()).toBe(2)
    expect(el.querySelector('b')).not.toBeNull()
    s.set(false)
    expect(el.querySelector('b')).toBeNull()
    dispose()
  })

  it('null-initial accessor: 2 at mount, reactive after', () => {
    const s = signal(false)
    const c = counted(() => (s() ? h('b', null, 'x') : null))
    const el = document.createElement('div')
    const dispose = mount(() => h('div', null, c.acc as never), el)
    expect(c.calls()).toBe(2)
    s.set(true)
    expect(el.querySelector('b')).not.toBeNull()
    dispose()
  })

  it('keyed-array accessor: 2 at mount, keyed reconciliation preserved', () => {
    const items = signal([1, 2, 3])
    const c = counted(() => items().map((i) => h('li', { key: i }, String(i))))
    const el = document.createElement('div')
    const dispose = mount(() => h('ul', null, c.acc as never), el)
    expect(c.calls()).toBe(2)
    const li1 = el.querySelectorAll('li')[0]
    items.set([1, 2, 3, 4])
    // Keyed reconciler reuses the surviving DOM node — proof the handoff
    // landed in mountKeyedList, not a teardown/remount path.
    expect(el.querySelectorAll('li')[0]).toBe(li1)
    expect(el.querySelectorAll('li').length).toBe(4)
    dispose()
  })
})
