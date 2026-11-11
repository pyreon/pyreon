// Regression lock: a TEXTISH reactive accessor child runs EXACTLY ONCE at
// mount (the classification call IS the subscription-establishing tracked
// run — mountAccessorChild in mount.ts). Historically mountChild ran every
// function child twice: an untracked classification sample + the binding
// machinery's own tracked first run (~12k invocations for 6k reactive cells
// in the @pyreon/table bench, PR #2881's finding).
//
// The STRUCTURAL (keyed-array / general VNode / null-initial) branches run
// ONCE too: the classified value, the sources its call read and the effects /
// `onCleanup`s it registered are handed to mountKeyedList / mountReactive as a
// `FirstRun`, whose effect replays the reads instead of calling the accessor
// again. The ownership specs below lock that the single call's inner effects
// and cleanups belong to the effect that re-runs, exactly as before.
//
// Bisect-verified: reverting mountChild to the sample-then-dispatch shape
// fails the `toBe(1)` specs with `expected 2 to be 1`.
import { transformJSX } from '@pyreon/compiler'
import { For, Fragment, h } from '@pyreon/core'
import { effect, onCleanup, signal } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { _mountSlot, _tpl, mount } from '../index'

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

describe('structural shapes also run ONCE at mount', () => {
  it('general (conditional VNode) accessor: 1 at mount, reactive after', () => {
    const s = signal(true)
    const c = counted(() => (s() ? h('b', null, 'x') : null))
    const el = document.createElement('div')
    const dispose = mount(() => h('div', null, c.acc as never), el)
    expect(c.calls()).toBe(1)
    expect(el.querySelector('b')).not.toBeNull()
    s.set(false)
    expect(c.calls()).toBe(2)
    expect(el.querySelector('b')).toBeNull()
    dispose()
  })

  it('null-initial accessor: 1 at mount, reactive after', () => {
    const s = signal(false)
    const c = counted(() => (s() ? h('b', null, 'x') : null))
    const el = document.createElement('div')
    const dispose = mount(() => h('div', null, c.acc as never), el)
    expect(c.calls()).toBe(1)
    s.set(true)
    expect(el.querySelector('b')).not.toBeNull()
    dispose()
  })

  it('keyed-array accessor: 1 at mount, keyed reconciliation preserved', () => {
    const items = signal([1, 2, 3])
    const c = counted(() => items().map((i) => h('li', { key: i }, String(i))))
    const el = document.createElement('div')
    const dispose = mount(() => h('ul', null, c.acc as never), el)
    expect(c.calls()).toBe(1)
    const li1 = el.querySelectorAll('li')[0]
    items.set([1, 2, 3, 4])
    // Keyed reconciler reuses the surviving DOM node — proof the handoff
    // landed in mountKeyedList, not a teardown/remount path.
    expect(el.querySelectorAll('li')[0]).toBe(li1)
    expect(el.querySelectorAll('li').length).toBe(4)
    dispose()
  })

  it('an effect created by the single call belongs to the effect that re-runs', () => {
    const gate = signal(true)
    const tick = signal(0)
    let fires = 0
    const acc = () => {
      effect(() => {
        tick()
        fires++
      })
      return gate() ? h('b', null, 'x') : h('i', null, 'y')
    }
    const el = document.createElement('div')
    const dispose = mount(() => h('div', null, acc as never), el)
    expect(fires).toBe(1)
    tick.set(1)
    expect(fires).toBe(2) // one live inner effect, not two
    gate.set(false) // re-run: the first run's inner effect is disposed
    fires = 0
    tick.set(2)
    expect(fires).toBe(1)
    dispose()
    tick.set(3)
    expect(fires).toBe(1)
  })

  it('an onCleanup registered by the single call runs before the re-run', () => {
    const gate = signal(true)
    const log: string[] = []
    const acc = () => {
      const g = gate()
      onCleanup(() => log.push(`cleanup ${g}`))
      return g ? h('b', null, 'x') : h('i', null, 'y')
    }
    const el = document.createElement('div')
    const dispose = mount(() => h('div', null, acc as never), el)
    expect(log).toEqual([])
    gate.set(false)
    expect(log).toEqual(['cleanup true'])
    dispose()
    expect(log).toEqual(['cleanup true', 'cleanup false'])
  })

  it('a .map accessor through the REAL compiler maps once at mount', () => {
    const items = signal([1, 2, 3])
    let maps = 0
    const src = `const App = () => <ul>{() => S.items().map((i) => { S.tick(); return <li>{i}</li> })}</ul>`
    const { code } = transformJSX(src, 'test.tsx', {} as never)
    const body = transformSync(code.replace(/^import\s+.*$/gm, ''), {
      loader: 'tsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment',
    }).code
    const App = new Function('h', 'Fragment', '_tpl', '_mountSlot', 'S', `${body}\nreturn App`)(
      h, Fragment, _tpl, _mountSlot, { items, tick: () => maps++ },
    ) as () => never
    const el = document.createElement('div')
    const dispose = mount(h(App, null), el)
    expect(el.querySelectorAll('li')).toHaveLength(3)
    expect(maps).toBe(3)
    items.set([1, 2, 3, 4])
    expect(el.querySelectorAll('li')).toHaveLength(4)
    expect(maps).toBe(7)
    dispose()
  })
})
