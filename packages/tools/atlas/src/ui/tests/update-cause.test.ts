/**
 * "Why did this update?" — the pure half.
 *
 * Run against a REAL reactive graph. A fabricated `UpdateCause` fixture would
 * only prove the renderer can read its own field names; what has to hold is
 * that a real signal → computed → effect cascade comes back as the chain a
 * reader would draw by hand.
 */
import { computed, effect, signal } from '@pyreon/reactivity'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  causeSteps,
  causeSummary,
  explain,
  recentCandidates,
} from '../update-cause'

beforeEach(() => {
  // `recentCandidates` attaches the devtools bridge (idempotent). Calling it
  // here means a test never depends on another test having attached first —
  // and nodes created BEFORE attachment are not recorded, so ordering matters.
  recentCandidates()
})

describe('a real cascade', () => {
  it('names the signal behind an effect, not just "something changed"', () => {
    const price = signal(10, { name: 'price' })
    // No `{ name }` — `ComputedOptions` has no such field, and the registry
    // auto-names it `derived#N`. The test selects it by KIND for that reason.
    const total = computed(() => price() * 2)
    let seen = 0
    effect(() => {
      void total()
      seen += 1
    })

    price.set(20)
    expect(seen, 'the effect really re-ran').toBe(2)

    // Ask about the derived value — the interesting middle of the chain.
    // Selected by KIND, not by name: the registry auto-names an unnamed
    // computed `derived#N` (a `{ name }` option is not honoured for computed),
    // so keying the test on a friendly name would assert a naming detail
    // instead of the causal reconstruction this panel exists for.
    const candidates = recentCandidates()
    const target = candidates.find((c) => c.kind === 'derived')
    expect(target, `no derived node among: ${candidates.map((c) => c.name).join(', ')}`).toBeDefined()

    const cause = explain(target!.id)
    expect(cause, 'a cause should be reconstructable for a node that just fired').not.toBeNull()

    const steps = causeSteps(cause!)
    // Root-first, target last — the direction a reader wants.
    expect(steps.at(-1)?.isTarget).toBe(true)
    expect(steps.at(-1)?.id).toBe(target!.id)
    // The whole point: the SIGNAL is named, not merely "something upstream".
    expect(steps.map((s) => s.name)).toContain('price')
  })

  it('says a directly-set signal IS the origin rather than inventing a cause', () => {
    const flag = signal(false, { name: 'flag' })
    flag.set(true)

    const target = recentCandidates().find((c) => c.name === 'flag')
    expect(target).toBeDefined()
    const cause = explain(target!.id)
    expect(cause).not.toBeNull()
    if (cause!.chain.length === 0) {
      expect(causeSummary(cause!)).toContain('IS the origin')
    } else {
      // If a chain was reconstructed it must still end at this node.
      expect(causeSteps(cause!).at(-1)?.name).toBe('flag')
    }
  })

  it('offers newest activity first, so the operator sees what they just caused', () => {
    const older = signal(0, { name: 'older-node' })
    older.set(1)
    const newer = signal(0, { name: 'newer-node' })
    newer.set(1)

    const names = recentCandidates().map((c) => c.name)
    const iNew = names.indexOf('newer-node')
    const iOld = names.indexOf('older-node')
    expect(iNew, 'newer node missing').toBeGreaterThanOrEqual(0)
    expect(iOld, 'older node missing').toBeGreaterThanOrEqual(0)
    expect(iNew).toBeLessThan(iOld)
  })

  it('lists each node once however many times it fired', () => {
    const busy = signal(0, { name: 'busy' })
    for (let i = 1; i <= 5; i += 1) busy.set(i)
    const hits = recentCandidates(50).filter((c) => c.name === 'busy')
    expect(hits).toHaveLength(1)
    expect(hits[0]!.fires).toBeGreaterThan(1)
  })

  it('returns null for a node id that does not exist, instead of guessing', () => {
    expect(explain(999_999)).toBeNull()
  })
})

describe('summary honesty', () => {
  it('states when the chain was truncated rather than presenting it as complete', () => {
    // The fire buffer is bounded, so an origin can age out. Presenting a
    // truncated chain as whole would mislead exactly where someone is trying
    // to reason carefully, so `rootReached: false` has to reach the text.
    const truncated = {
      target: { id: 2, kind: 'effect' as const, name: 'render', ts: 2 },
      chain: [{ id: 1, kind: 'derived' as const, name: 'mid', ts: 1 }],
      rootReached: false,
    }
    expect(causeSummary(truncated)).toContain('truncated')

    const whole = { ...truncated, rootReached: true }
    expect(causeSummary(whole)).not.toContain('truncated')
  })

  it('counts hops so an unexpectedly long chain is visible at a glance', () => {
    const cause = {
      target: { id: 3, kind: 'effect' as const, name: 'paint', ts: 3 },
      chain: [
        { id: 1, kind: 'signal' as const, name: 'a', ts: 1 },
        { id: 2, kind: 'derived' as const, name: 'b', ts: 2 },
      ],
      rootReached: true,
    }
    expect(causeSummary(cause)).toContain('2 hops')
    expect(causeSummary(cause)).toContain('a changed')
  })
})
