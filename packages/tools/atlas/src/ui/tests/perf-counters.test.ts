/**
 * The perf-counter sink.
 *
 * The assertions worth having are about NOT breaking the neighbours: the sink
 * is a single global slot, and the obvious implementation silently destroys
 * whatever was already installed.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  areCountersAvailable,
  counterDelta,
  installCounterSink,
  resetCounters,
  snapshotCounters,
  uninstallCounterSink,
} from '../perf-counters'

type Slot = { __pyreon_count__?: (name: string, n?: number) => void }
const slot = globalThis as Slot

afterEach(() => {
  // Drain any refcount a failing test left behind, then clear the slot.
  for (let i = 0; i < 5; i += 1) uninstallCounterSink()
  delete slot.__pyreon_count__
  resetCounters()
})

describe('collecting', () => {
  it('records counts emitted through the global convention', () => {
    installCounterSink()
    slot.__pyreon_count__?.('styler.resolve')
    slot.__pyreon_count__?.('styler.resolve')
    slot.__pyreon_count__?.('runtime.mount', 3)
    expect(snapshotCounters()).toEqual({ 'styler.resolve': 2, 'runtime.mount': 3 })
  })

  it('defaults the increment to 1', () => {
    installCounterSink()
    slot.__pyreon_count__?.('x')
    expect(snapshotCounters().x).toBe(1)
  })
})

describe('not breaking the neighbours', () => {
  it('FORWARDS to a sink that was already installed', () => {
    // A naive install destroys the perf-dashboard's sink (or a host app's) and
    // the loss is silent — the other consumer just stops seeing counts.
    const seen: string[] = []
    slot.__pyreon_count__ = (name) => seen.push(name)

    installCounterSink()
    slot.__pyreon_count__?.('styler.resolve')

    expect(snapshotCounters()['styler.resolve']).toBe(1)
    expect(seen, 'the pre-existing sink must still receive the count').toEqual(['styler.resolve'])
  })

  it('restores the previous sink on uninstall', () => {
    const original = () => {}
    slot.__pyreon_count__ = original
    installCounterSink()
    expect(slot.__pyreon_count__).not.toBe(original)
    uninstallCounterSink()
    expect(slot.__pyreon_count__).toBe(original)
  })

  it('removes the slot entirely when there was nothing before', () => {
    delete slot.__pyreon_count__
    installCounterSink()
    uninstallCounterSink()
    expect('__pyreon_count__' in slot).toBe(false)
  })

  it('is refcounted — two holders, one restore', () => {
    const original = () => {}
    slot.__pyreon_count__ = original
    installCounterSink()
    installCounterSink()
    uninstallCounterSink()
    expect(slot.__pyreon_count__, 'still collecting for the second holder').not.toBe(original)
    uninstallCounterSink()
    expect(slot.__pyreon_count__).toBe(original)
  })

  it('does not clobber a sink installed AFTER ours', () => {
    installCounterSink()
    const later = () => {}
    slot.__pyreon_count__ = later
    uninstallCounterSink()
    // Restoring blindly here would delete someone else's live sink.
    expect(slot.__pyreon_count__).toBe(later)
  })

  it('survives an unbalanced uninstall', () => {
    expect(() => uninstallCounterSink()).not.toThrow()
  })
})

describe('delta', () => {
  it('reports only what changed, largest first', () => {
    // A cumulative total is dominated by startup and says nothing about the
    // interaction just performed.
    const rows = counterDelta(
      { 'styler.resolve': 100, 'runtime.mount': 5, idle: 7 },
      { 'styler.resolve': 122, 'runtime.mount': 45, idle: 7 },
    )
    expect(rows).toEqual([
      { name: 'runtime.mount', delta: 40 },
      { name: 'styler.resolve', delta: 22 },
    ])
  })

  it('counts a counter that appears for the first time', () => {
    expect(counterDelta({}, { fresh: 3 })).toEqual([{ name: 'fresh', delta: 3 }])
  })
})

describe('availability', () => {
  it('is true under test, where the emit sites are live', () => {
    // Every emit site is behind a dev gate, so a production build records
    // nothing — and an empty result there means "not measurable", not "free".
    expect(areCountersAvailable()).toBe(true)
  })
})
