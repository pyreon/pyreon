/**
 * Real-app reactive end-to-end proof.
 *
 * The Signals/Graph/Effects/Profiler tabs consume
 * `window.__PYREON_DEVTOOLS__.reactive`. The drift lock in
 * `framework-integration.test.ts` proves the *contract* and
 * `reactive-view.test.ts` proves the *presentation logic* in isolation
 * — but nothing mounts a genuine reactive app and proves the WHOLE
 * chain (framework opt-in registry → hook → the extension's actual
 * `layoutGraph` / `bucketFires`) works against the real, merged
 * Foundation. That is exactly the test-environment-parity gap (mocks
 * pass while the real path silently drifts).
 *
 * This file closes it: it drives the real `@pyreon/reactivity`
 * primitives through the real `@pyreon/runtime-dom` devtools hook and
 * feeds the live snapshot into the extension's own panel-facing code.
 */
import { h } from '@pyreon/core'
import {
  __resetReactiveDevtoolsForTesting,
  computed,
  type ReactiveFire as FwFire,
  type ReactiveGraph as FwGraph,
  type ReactiveNode as FwNode,
  effect,
  signal,
} from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bucketFires, layoutGraph } from '../reactive-view'
import type {
  ReactiveFire as ExtFire,
  ReactiveGraph as ExtGraph,
  ReactiveNode as ExtNode,
} from '../types'

// ── Cross-PR reactive drift lock ─────────────────────────────────────
// Now that the Foundation is merged, `@pyreon/reactivity` exports the
// real reactive types — assert the extension's local mirror is
// bidirectionally assignable. A framework add/rename/remove on the
// reactive contract now fails `tsc` (type-only; never executed).
type _AssertGraphFwToExt = FwGraph extends ExtGraph ? true : never
type _AssertGraphExtToFw = ExtGraph extends FwGraph ? true : never
type _AssertNodeFwToExt = FwNode extends ExtNode ? true : never
type _AssertNodeExtToFw = ExtNode extends FwNode ? true : never
type _AssertFireFwToExt = FwFire extends ExtFire ? true : never
type _AssertFireExtToFw = ExtFire extends FwFire ? true : never
const _g1: _AssertGraphFwToExt = true
const _g2: _AssertGraphExtToFw = true
const _n1: _AssertNodeFwToExt = true
const _n2: _AssertNodeExtToFw = true
const _f1: _AssertFireFwToExt = true
const _f2: _AssertFireExtToFw = true
void [_g1, _g2, _n1, _n2, _f1, _f2]

interface ReactiveHook {
  activate(): void
  deactivate(): void
  getGraph(): ExtGraph
  getFires(): ExtFire[]
}

let dispose: (() => void) | null = null

beforeEach(() => {
  // Full reset BEFORE every test so cross-test signal registry carryover
  // (always-on in __DEV__ per the post-#900 contract) can't pollute.
  __resetReactiveDevtoolsForTesting()
})

afterEach(() => {
  // Mirror — also reset after, in case the test's own activate() left
  // _active true.
  __resetReactiveDevtoolsForTesting()
  dispose?.()
  dispose = null
  document.body.innerHTML = ''
})

function reactiveHook(): ReactiveHook {
  const container = document.createElement('div')
  document.body.appendChild(container)
  // First mount installs window.__PYREON_DEVTOOLS__ (incl. `.reactive`).
  dispose = mount(h('div', null, 'app'), container)
  const dt = window.__PYREON_DEVTOOLS__
  if (!dt) throw new Error('__PYREON_DEVTOOLS__ not installed by mount()')
  const r = dt.reactive
  if (!r) {
    throw new Error(
      '__PYREON_DEVTOOLS__.reactive missing — Foundation not present in @pyreon/runtime-dom',
    )
  }
  return r as ReactiveHook
}

describe('reactive devtools — real-app end-to-end', () => {
  it('output is gated: getGraph/getFires return empty until activate()', () => {
    const r = reactiveHook()
    // Registry is always-on in __DEV__ — `$idle` IS recorded internally
    // — but until a devtools client calls activate(), the OUTPUT methods
    // return empty so non-attached consumers see nothing.
    const s = signal(1, { name: '$idle' })
    s.set(2)
    expect(r.getGraph().nodes).toHaveLength(0)
    expect(r.getFires()).toHaveLength(0)
  })

  it('REGRESSION: signals created BEFORE activate() appear after activate()', () => {
    // The bug this contract change fixes: a user opens the devtools
    // panel AFTER the app has mounted. Pre-fix `_rdRegister`
    // early-returned on `!_active`, so the late attach saw an empty
    // graph and the panel showed "174 components but 0 reactive nodes".
    // With always-on registration the graph populates the moment the
    // client attaches.
    const r = reactiveHook()
    // Build a real graph BEFORE activate — same shape as a real app
    // that has mounted ~hundreds of signals before the user opens the
    // panel.
    const a = signal(1, { name: '$pre_a' })
    const b = signal(2, { name: '$pre_b' })
    const sum = computed(() => a() + b())
    let seen = 0
    effect(() => {
      seen = sum()
    })
    expect(seen).toBe(3)
    a.set(5)
    expect(seen).toBe(7)

    // Devtools client attaches LATE.
    r.activate()

    const g = r.getGraph()
    expect(g.nodes.find((n) => n.name === '$pre_a')).toBeDefined()
    expect(g.nodes.find((n) => n.name === '$pre_b')).toBeDefined()
    expect(g.nodes.some((n) => n.kind === 'derived')).toBe(true)
    expect(g.nodes.some((n) => n.kind === 'effect')).toBe(true)
    // signal $pre_a, $pre_b, derived (sum), effect = 4 nodes minimum.
    expect(g.nodes.length).toBeGreaterThanOrEqual(4)
    // signal → derived → effect chain visible in edges.
    expect(g.edges.length).toBeGreaterThanOrEqual(3)
  })

  it('tracks a real signal→derived→effect graph + fires, then the extension lays it out', () => {
    const r = reactiveHook()
    r.activate()

    // Build a genuine reactive graph AFTER activation (registration is
    // gated on the active flag — same as a devtools panel attaching).
    const price = signal(10, { name: '$price' })
    const qty = signal(2, { name: '$qty' })
    const total = computed(() => price() * qty())
    let observed = 0
    effect(() => {
      observed = total()
    })
    expect(observed).toBe(20)

    // Mutate → real notify cascade: signal → computed recompute → effect.
    price.set(15)
    expect(observed).toBe(30)
    qty.set(3)
    expect(observed).toBe(45)

    const graph: ExtGraph = r.getGraph()
    const byName = (n: string) => graph.nodes.find((x) => x.name === n)

    // Nodes: two signals, one derived, one (anonymous) effect.
    expect(byName('$price')?.kind).toBe('signal')
    expect(byName('$qty')?.kind).toBe('signal')
    const der = graph.nodes.find((n) => n.kind === 'derived')
    const eff = graph.nodes.find((n) => n.kind === 'effect')
    expect(der).toBeDefined()
    expect(eff).toBeDefined()
    expect(graph.nodes.length).toBeGreaterThanOrEqual(4)

    // Value previews are live.
    expect(byName('$price')?.value).toBe('15')
    expect(byName('$qty')?.value).toBe('3')

    // Edges: both signals feed the derived; the derived feeds the effect.
    const priceId = byName('$price')!.id
    const qtyId = byName('$qty')!.id
    const derId = der!.id
    const effId = eff!.id
    const hasEdge = (from: number, to: number) =>
      graph.edges.some((e) => e.from === from && e.to === to)
    expect(hasEdge(priceId, derId)).toBe(true)
    expect(hasEdge(qtyId, derId)).toBe(true)
    expect(hasEdge(derId, effId)).toBe(true)

    // Fires recorded for the two writes' cascade.
    const fires: ExtFire[] = r.getFires()
    expect(fires.length).toBeGreaterThan(0)
    expect(fires.every((f) => typeof f.id === 'number' && typeof f.ts === 'number')).toBe(true)

    // ── The actual panel code over the LIVE snapshot ──────────────────
    // Graph tab: layered layout — signals left, derived mid, effect right.
    const laid = layoutGraph(graph)
    const lp = (id: number) => laid.nodes.find((n) => n.id === id)!
    expect(lp(priceId).x).toBeLessThan(lp(derId).x)
    expect(lp(derId).x).toBeLessThan(lp(effId).x)
    // All real edges survive the layout's endpoint filter.
    expect(laid.edges.length).toBe(graph.edges.length)

    // Profiler tab: fires bucket into frames, total preserved.
    const b = bucketFires(fires, 100)
    expect(b.total).toBe(fires.length)
    expect(b.frames.reduce((a, c) => a + c, 0)).toBe(fires.length)
    expect(b.max).toBeGreaterThanOrEqual(1)
  })

  it('deactivate() closes the read gate; subsequent activate() re-exposes the live graph', () => {
    // Per the post-#900 contract, `deactivate()` flips `_active = false`
    // but does NOT clear the registry — so a "close panel + reopen
    // panel" cycle re-exposes the same live graph. Clearing on
    // deactivate would re-create the activate-after-creation bug at the
    // close/reopen boundary.
    const r = reactiveHook()
    r.activate()
    const s = signal(0, { name: '$live' })
    effect(() => {
      s()
    })
    s.set(1)
    expect(r.getGraph().nodes.length).toBeGreaterThan(0)
    const beforeCount = r.getGraph().nodes.length

    r.deactivate()
    // Output gated — empty.
    expect(r.getGraph().nodes).toHaveLength(0)
    expect(r.getFires()).toHaveLength(0)

    // Re-activate — the same live nodes are re-exposed.
    r.activate()
    expect(r.getGraph().nodes.find((n) => n.name === '$live')).toBeDefined()
    expect(r.getGraph().nodes.length).toBe(beforeCount)
  })
})
