/**
 * ACCIDENTAL behaviour — run ORDER within one write or flush, pinned so a
 * change is noticed, not because it is promised. Each case names the design
 * decision (reactivity-core.md §0, §6) that changed it in stage (ii) (the
 * link-graph core) and keeps the order from before in a comment. Values, run
 * counts and settledness are unaffected by these decisions; only order moved.
 */
import { batch, computed, createSelector, effect, signal } from '../../../index'

describe('C23 (accidental) — within one write, direct updaters fire before tracking subscribers; two subscribers fire in subscription order', () => {
  test('C23: a direct updater registered LAST still fires before an earlier effect and listener', () => {
    // D5 keeps "direct first" and moves `subscribe` listeners INTO the direct
    // tier (registration order).
    const s = signal(0)
    const order: string[] = []
    effect(() => {
      if (s() > 0) order.push('effect')
    })
    s.subscribe(() => order.push('listener'))
    s.direct(() => order.push('direct'))
    s.set(1)
    expect(order).toEqual(['listener', 'direct', 'effect']) // before stage (ii): ['direct', 'effect', 'listener']
  })

  test('C23: two listeners fire in subscription order', () => {
    // Unchanged by D5: the direct tier keeps registration order.
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
  // D4: one queue in depth-first SUBSCRIPTION order, so the effect behind the
  // computed (subscribed first) runs first.
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
    expect(order).toEqual(['viaComputed', 'direct']) // before stage (ii): ['direct', 'viaComputed']
  })
})

describe('D5 — subscribe() listeners vs effects of the same write', () => {
  // D5: `subscribe()` is in the direct tier, so listeners fire before effects.
  test('D5: a listener fires before an effect subscribed earlier', () => {
    const s = signal(0)
    const order: string[] = []
    effect(() => {
      if (s() > 0) order.push('effect')
    })
    s.subscribe(() => order.push('listener'))
    s.set(1)
    expect(order).toEqual(['listener', 'effect']) // before stage (ii): ['effect', 'listener']
  })
})

describe('D9 — an effect that writes a signal it reads during its FIRST run re-runs after it', () => {
  // D9: re-entrant runs are serialised; the re-run happens right after the
  // first run returns, still before effect() returns.
  test('D9: first-run self-write — serialised, not nested', () => {
    const s = signal(0)
    const log: string[] = []
    effect(() => {
      const v = s()
      log.push(`start${v}`)
      if (v === 0) s.set(1)
      log.push(`end${v}`)
    })
    expect(log).toEqual(['start0', 'end0', 'start1', 'end1']) // before stage (ii): ['start0', 'start1', 'end1', 'end0']
    expect(s.peek()).toBe(1)
  })
})

describe('§6 — createSelector subscribers run after the selector source effect', () => {
  // §6: "createSelector subscribers run after the selector's source effect
  // finishes, not nested inside it". Before stage (ii) a row effect ran inside
  // the source effect's run, so it ran before an effect on the source that was
  // queued behind the selector.
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
    expect(order).toEqual(['source', 'row']) // before stage (ii): ['row', 'source']
  })
})
