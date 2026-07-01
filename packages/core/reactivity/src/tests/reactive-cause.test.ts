import { afterEach, describe, expect, it } from 'vitest'
import { computed } from '../computed'
import { effect } from '../effect'
import {
  __resetReactiveDevtoolsForTesting,
  activateReactiveDevtools,
  formatUpdateCause,
  getReactiveGraph,
  getUpdateCause,
} from '../reactive-devtools'
import { signal } from '../signal'

afterEach(() => __resetReactiveDevtoolsForTesting())

/** Find the id of the (single) node of a given kind + optional name. */
function nodeId(kind: 'signal' | 'derived' | 'effect', name?: string): number {
  const n = getReactiveGraph().nodes.find((x) => x.kind === kind && (!name || x.name === name))
  if (!n) throw new Error(`no ${kind} node${name ? ` named ${name}` : ''}`)
  return n.id
}

describe('getUpdateCause — "why did this update?"', () => {
  it('reconstructs signal → derived → effect back to the root cause', () => {
    activateReactiveDevtools()
    const price = signal(10, { name: '$price' })
    const total = computed(() => price() * 2)
    let ran = 0
    effect(() => {
      total()
      ran++
    })
    expect(ran).toBe(1) // initial run

    price.set(20) // cascade: price fires → total recomputes → effect re-runs
    expect(ran).toBe(2)

    const cause = getUpdateCause(nodeId('effect'))
    expect(cause).not.toBeNull()
    // chain is root-first: [$price (signal, changed), total (derived, recomputed)]
    expect(cause!.chain.map((l) => `${l.kind}:${l.name}`)).toEqual(['signal:$price', 'derived:derived#2'])
    expect(cause!.chain[0]!.kind).toBe('signal')
    expect(cause!.chain[0]!.name).toBe('$price')
    expect(cause!.rootReached).toBe(true)
    expect(cause!.target.kind).toBe('effect')
  })

  it('a derived names the signal that caused its recompute', () => {
    activateReactiveDevtools()
    const a = signal(1, { name: '$a' })
    const doubled = computed(() => a() * 2)
    // keep the computed non-lazy so it recomputes eagerly on change
    effect(() => {
      doubled()
    })
    a.set(9)
    const cause = getUpdateCause(nodeId('derived'))
    expect(cause).not.toBeNull()
    expect(cause!.chain).toHaveLength(1)
    expect(cause!.chain[0]).toMatchObject({ kind: 'signal', name: '$a' })
    expect(cause!.rootReached).toBe(true)
  })

  it('a directly-set signal has an empty chain (it IS the root)', () => {
    activateReactiveDevtools()
    const s = signal(0, { name: '$s' })
    s.set(1)
    const cause = getUpdateCause(nodeId('signal', '$s'))
    expect(cause).not.toBeNull()
    expect(cause!.chain).toHaveLength(0)
    expect(cause!.rootReached).toBe(true)
    expect(cause!.target.name).toBe('$s')
  })

  it('returns null for a node that never fired', () => {
    activateReactiveDevtools()
    const s = signal(0, { name: '$never' })
    // never write it → no fire
    expect(getUpdateCause(nodeId('signal', '$never'))).toBeNull()
  })

  it('returns null when devtools is inactive', () => {
    // no activateReactiveDevtools()
    const s = signal(0)
    s.set(1)
    expect(getUpdateCause(1)).toBeNull()
  })

  it('formatUpdateCause renders a source-anchored trace with the causal arrows', () => {
    activateReactiveDevtools()
    const qty = signal(1, { name: '$qty' })
    const total = computed(() => qty() * 5)
    effect(() => {
      total()
    })
    qty.set(3)
    const out = formatUpdateCause(getUpdateCause(nodeId('effect'))!)
    expect(out).toContain('Why did')
    expect(out).toContain('$qty (signal) changed')
    expect(out).toContain('recomputed')
    expect(out).toContain('ran')
    expect(out).toContain('← explained')
  })
})
