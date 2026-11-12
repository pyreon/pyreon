/**
 * ACCIDENTAL behaviour — run ORDER within one write or flush, pinned as it is
 * TODAY so a change is noticed, not because it is promised. Each case names
 * the design decision (reactivity-core.md §0, §6) that changes it and the
 * order the assertion becomes after stage (ii). Values, run counts and
 * settledness are unaffected by these decisions; only order moves.
 */
import { batch, computed, createSelector, effect, signal } from '../../../index'

describe('C23 (accidental) — within one write, direct updaters fire before tracking subscribers; two subscribers fire in subscription order', () => {
  test('C23: a direct updater registered LAST still fires before an earlier effect and listener', () => {
    // D5 keeps "direct first" but moves `subscribe` listeners INTO the direct
    // tier (registration order), so after stage (ii) this becomes
    // ['listener', 'direct', 'effect'].
    const s = signal(0)
    const order: string[] = []
    effect(() => {
      if (s() > 0) order.push('effect')
    })
    s.subscribe(() => order.push('listener'))
    s.direct(() => order.push('direct'))
    s.set(1)
    expect(order).toEqual(['direct', 'effect', 'listener']) // stage (ii): ['listener', 'direct', 'effect']
  })

  test('C23: two listeners fire in subscription order', () => {
    // Unchanged by D5 if the direct tier keeps registration order.
    const s = signal(0)
    const order: string[] = []
    s.subscribe(() => order.push('first'))
    s.subscribe(() => order.push('second'))
    s.set(1)
    batch(() => s.set(2))
    expect(order).toEqual(['first', 'second', 'first', 'second'])
  })
})

describe('C24 (accidental; decision D4) — directly-subscribed effects run before effects behind a gated computed', () => {
  // D4: one queue in depth-first SUBSCRIPTION order. After stage (ii) the
  // effect behind the computed (subscribed first) runs first: ['viaComputed', 'direct'].
  test('C24: effect behind a computed (subscribed first) vs effect on the signal (subscribed second)', () => {
    const s = signal(0)
    const c = computed(() => s() * 2)
    const order: string[] = []
    effect(() => {
      if (c() > 0) order.push('viaComputed')
    })
    effect(() => {
      if (s() > 0) order.push('direct')
    })
    s.set(1)
    expect(order).toEqual(['direct', 'viaComputed']) // stage (ii): ['viaComputed', 'direct']
  })
})

describe('D5 — subscribe() listeners vs effects of the same write', () => {
  // D5: `subscribe()` moves into the direct tier, so listeners fire before
  // effects. After stage (ii): ['listener', 'effect'].
  test('D5: an effect subscribed before a listener runs first today', () => {
    const s = signal(0)
    const order: string[] = []
    effect(() => {
      if (s() > 0) order.push('effect')
    })
    s.subscribe(() => order.push('listener'))
    s.set(1)
    expect(order).toEqual(['effect', 'listener']) // stage (ii): ['listener', 'effect']
  })
})

describe('D9 — an effect that writes a signal it reads during its FIRST run re-runs nested', () => {
  // D9: re-entrant runs are serialised; the re-run happens right after the
  // first run returns, still before effect() returns. After stage (ii):
  // ['start0', 'end0', 'start1', 'end1'].
  test('D9: first-run self-write — nested today', () => {
    const s = signal(0)
    const log: string[] = []
    effect(() => {
      const v = s()
      log.push(`start${v}`)
      if (v === 0) s.set(1)
      log.push(`end${v}`)
    })
    expect(log).toEqual(['start0', 'start1', 'end1', 'end0']) // stage (ii): ['start0', 'end0', 'start1', 'end1']
    expect(s.peek()).toBe(1)
  })
})

describe('§6 — createSelector subscribers run nested inside the selector source effect', () => {
  // §6: "createSelector subscribers run after the selector's source effect
  // finishes, not nested inside it". Today a row effect runs inside the
  // source effect's run, so it runs before an effect on the source that was
  // queued behind the selector. After stage (ii): ['source', 'row'].
  test('§6: row effect vs an effect on the selector source subscribed after the selector', () => {
    const sel = signal(0)
    const isSelected = createSelector(sel)
    const order: string[] = []
    effect(() => {
      if (isSelected(1)) order.push('row')
    })
    effect(() => {
      if (sel() === 1) order.push('source')
    })
    sel.set(1)
    expect(order).toEqual(['row', 'source']) // stage (ii): ['source', 'row']
  })
})
