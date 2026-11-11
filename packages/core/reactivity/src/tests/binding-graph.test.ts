/**
 * DOM-binding primitives are reactive-graph nodes (#4470).
 *
 * Compiled templates update the DOM through `renderEffect`, `_bind` and a
 * source's `direct()` slot. Before the fix `renderEffect` registered but never
 * counted a re-run as a fire, `_bind` never registered, and a `direct()`
 * updater was invisible (not a node, no edge, not even counted as a
 * subscriber) — so Reactive Coverage reported every DOM binding as
 * never-ran / absent and `describeReactiveGraph` called a signal shown only
 * through compiled text an orphan.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { computed } from '../computed'
import {
  computeReactiveCoverage,
  startReactiveCoverage,
  stopReactiveCoverage,
  takeReactiveCoverage,
} from '../coverage'
import { _bind, renderEffect } from '../effect'
import { describeReactiveGraph } from '../reactive-describe'
import {
  __resetReactiveDevtoolsForTesting,
  _rdCloseBindingFrame,
  _rdLabelBinding,
  _rdNodeId,
  _rdNoteTarget,
  _rdOpenBindingFrame,
  activateReactiveDevtools,
  getReactiveGraph,
  getUpdateCause,
  type ReactiveNode,
} from '../reactive-devtools'
import { signal } from '../signal'

afterEach(() => {
  stopReactiveCoverage()
  __resetReactiveDevtoolsForTesting()
})

function fresh(before: Set<number>): ReactiveNode[] {
  return getReactiveGraph().nodes.filter((n) => !before.has(n.id))
}

describe('binding primitives in the reactive graph', () => {
  it('the issue reproduction: renderEffect and _bind both appear and count every run', () => {
    activateReactiveDevtools()
    const s = signal(0)
    const before = new Set(getReactiveGraph().nodes.map((n) => n.id))
    let a = 0
    let b = 0
    renderEffect(() => {
      a += s()
    })
    _bind(() => {
      b += s()
    })
    s.set(1)
    s.set(2)
    expect([a, b]).toEqual([3, 3])
    expect(fresh(before).map((n) => [n.kind, n.fires])).toEqual([
      ['effect', 3],
      ['effect', 3],
    ])
  })

  it('a direct() updater is a node with an edge from its source, and counts notifications', () => {
    activateReactiveDevtools()
    const s = signal(0)
    const sid = _rdNodeId(s)!
    const before = new Set(getReactiveGraph().nodes.map((n) => n.id))
    let seen = 0
    const dispose = s.direct(() => {
      seen = s.peek()
    })
    s.set(5)
    s.set(6)
    expect(seen).toBe(6)
    const g = getReactiveGraph()
    const node = fresh(before)[0]!
    expect(node.kind).toBe('effect')
    // subscribe = mount run (1) + two notifications
    expect(node.fires).toBe(3)
    expect(g.edges).toContainEqual({ from: sid, to: node.id })
    expect(g.nodes.find((n) => n.id === sid)!.subscribers).toBe(1)
    dispose()
    expect(getReactiveGraph().edges.some((e) => e.to === node.id)).toBe(false)
  })

  it('a computed direct() subscriber is an edge too', () => {
    activateReactiveDevtools()
    const s = signal(1)
    const c = computed(() => s() * 2)
    c()
    const before = new Set(getReactiveGraph().nodes.map((n) => n.id))
    c.direct(() => {})
    const node = fresh(before)[0]!
    expect(getReactiveGraph().edges).toContainEqual({ from: _rdNodeId(c)!, to: node.id })
  })

  it('subscribing the same updater twice is one node, as it is one Set entry in production', () => {
    activateReactiveDevtools()
    const s = signal(0)
    let runs = 0
    const u = () => {
      runs++
    }
    s.direct(() => {})
    const before = new Set(getReactiveGraph().nodes.map((n) => n.id))
    s.direct(u)
    s.direct(u)
    s.set(1)
    expect(runs).toBe(1)
    expect(fresh(before)).toHaveLength(1)
  })

  it('a dead binding (no dependency on its first run) is not registered', () => {
    activateReactiveDevtools()
    const before = new Set(getReactiveGraph().nodes.map((n) => n.id))
    renderEffect(() => {})
    _bind(() => {})
    expect(fresh(before)).toEqual([])
  })

  it('the DOM setter called during the first run names the binding', () => {
    activateReactiveDevtools()
    const s = signal('a')
    const el = { localName: 'div' }
    const before = new Set(getReactiveGraph().nodes.map((n) => n.id))
    _bind(() => {
      s()
      _rdNoteTarget(el, 'attr', 'aria-busy')
      // only the first target names it
      _rdNoteTarget(el, 'class')
    })
    s.set('b')
    const [node] = fresh(before)
    expect(node).toMatchObject({ binding: 'attr', target: 'div', key: 'aria-busy', name: 'aria-busy on <div>' })
  })

  it('nested first runs keep their own labels (LIFO frame)', () => {
    activateReactiveDevtools()
    const s = signal(0)
    const before = new Set(getReactiveGraph().nodes.map((n) => n.id))
    renderEffect(() => {
      s()
      _bind(() => {
        s()
        _rdNoteTarget({ localName: 'span' }, 'class')
      })
      _rdNoteTarget({ localName: 'li' }, 'style')
    })
    const names = fresh(before).map((n) => n.name)
    expect(names.sort()).toEqual(['class on <span>', 'style on <li>'])
  })

  it('a setter outside any first run records nothing (re-runs and static writes are free)', () => {
    _rdNoteTarget({ localName: 'div' }, 'attr', 'x')
    _rdOpenBindingFrame()
    expect(_rdCloseBindingFrame()).toBeNull()
  })

  it('_rdLabelBinding labels by disposer or by raw direct updater, and can drop a framework loc', () => {
    activateReactiveDevtools()
    const s = signal(0)
    const before = new Set(getReactiveGraph().nodes.map((n) => n.id))
    const d = renderEffect(() => {
      s()
    })
    const u = () => {}
    s.direct(u)
    _rdLabelBinding(d, 'child', { localName: 'ul' }, undefined, null)
    _rdLabelBinding(u, 'text', { parentNode: { localName: 'p' } }, undefined, undefined)
    const nodes = fresh(before)
    expect(nodes.map((n) => n.name).sort()).toEqual(['child of <ul>', 'text in <p>'])
    expect(nodes.find((n) => n.binding === 'child')!.loc).toBeUndefined()
  })

  it('getUpdateCause walks from a binding back to the signal that changed', () => {
    activateReactiveDevtools()
    const s = signal(0, { name: 'count' })
    const before = new Set(getReactiveGraph().nodes.map((n) => n.id))
    _bind(() => {
      s()
    })
    s.set(1)
    const [node] = fresh(before)
    const cause = getUpdateCause(node!.id)!
    expect(cause.rootReached).toBe(true)
    expect(cause.chain.map((l) => l.name)).toEqual(['count'])
  })
})

describe('coverage and describe see DOM bindings', () => {
  it('a binding is ran-once until its signal changes, then covered', () => {
    startReactiveCoverage()
    const s = signal(0)
    _bind(() => {
      s()
    })
    const u = () => {}
    s.direct(u)
    const before = takeReactiveCoverage().entries.filter((e) => e.kind === 'effect')
    expect(before.map((e) => e.reason)).toEqual(['ran-once', 'ran-once'])
    s.set(1)
    const after = takeReactiveCoverage().entries.filter((e) => e.kind === 'effect')
    expect(after.map((e) => e.reason)).toEqual(['covered', 'covered'])
  })

  it('counts DOM bindings separately and carries their labels', () => {
    activateReactiveDevtools()
    const s = signal(0)
    const d = renderEffect(() => {
      s()
    })
    _rdLabelBinding(d, 'text', { localName: 'b' }, undefined, null)
    const report = computeReactiveCoverage(getReactiveGraph().nodes)
    expect(report.bindings).toEqual({ total: 1, covered: 0 })
    expect(report.entries.find((e) => e.binding === 'text')).toMatchObject({ target: 'b' })
  })

  it('a signal shown only through direct bindings is not an orphan', () => {
    activateReactiveDevtools()
    const s = signal(0, { name: 'shown' })
    s.direct(() => {})
    const desc = describeReactiveGraph()
    expect(desc.insights.filter((i) => i.kind === 'orphan-signal')).toEqual([])
    expect(desc.summary.bindings).toBe(0)
    expect(desc.nodes.find((n) => n.name === 'shown')!.behavior).toBe('changing it runs 1 effect')
  })

  it('describes DOM bindings as bindings, and keeps them out of high-fanout', () => {
    activateReactiveDevtools()
    const s = signal(0, { name: 'theme' })
    for (let i = 0; i < 10; i++) {
      const d = renderEffect(() => {
        s()
      })
      _rdLabelBinding(d, 'class', { localName: 'div' }, undefined, null)
    }
    const desc = describeReactiveGraph()
    expect(desc.summary.bindings).toBe(10)
    expect(desc.summary.effects).toBe(0)
    expect(desc.nodes.find((n) => n.name === 'theme')!.behavior).toBe('changing it updates 10 DOM bindings')
    expect(desc.insights.some((i) => i.kind === 'high-fanout')).toBe(false)
  })
})
