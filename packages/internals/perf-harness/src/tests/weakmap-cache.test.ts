// @vitest-environment happy-dom
/**
 * WeakMap cache lifecycle probe.
 *
 * Pyreon uses WeakMap in several hot caches:
 *   - styler static component cache (strings → ComponentFn)
 *   - styler Tier 2 class cache ($rocketstyle → $rocketstate → class)
 *   - rocketstyle dimensions cache (themes → dimensions)
 *   - rocketstyle localThemeManager (theme → resolved theme)
 *   - rocketstyle omit-set cache (reserved keys → Set)
 *
 * WeakMaps guarantee entries are GC'd when the key is unreachable.
 * Problems arise when keys are STRONGLY referenced by the cache value
 * itself — that defeats the WeakMap purpose.
 *
 * This probe can't observe GC directly, but it validates the HAPPY
 * PATH: repeated lookups with the SAME key hit the cache; new keys
 * miss; cleared keys stop hitting (when we zero our reference).
 */
import { sheet, StyleSheet } from '@pyreon/styler'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _disable, _reset } from '../counters'
import { install, perfHarness, uninstall } from '../harness'

beforeEach(() => {
  _reset()
  install()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
})

describe('WeakMap / sheet cache lifecycle', () => {
  it('sheet.insert cache hits on repeated insertion of same CSS', async () => {
    const s = new StyleSheet()
    const outcome = await perfHarness.record('repeated-insert', () => {
      for (let i = 0; i < 1000; i++) {
        s.insert('color: red')
      }
    })
    // 1000 insert calls, 999 cache hits, 1 real insert
    expect(outcome.after['styler.sheet.insert']).toBe(1000)
    expect(outcome.after['styler.sheet.insert.hit']).toBe(999)
  })

  it('sheet.insert hit ratio approaches 100% when CSS is a finite set', async () => {
    const s = new StyleSheet()
    const uniqueCss = Array.from({ length: 20 }, (_, i) => `color: ${i}`)
    const outcome = await perfHarness.record('20-unique', () => {
      // First pass: inserts
      for (const c of uniqueCss) s.insert(c)
      // 10 more passes: all hits
      for (let pass = 0; pass < 10; pass++) {
        for (const c of uniqueCss) s.insert(c)
      }
    })
    // Total calls: 20 + 200 = 220
    // Cache misses: 20 (first pass)
    // Cache hits: 200
    expect(outcome.after['styler.sheet.insert']).toBe(220)
    expect(outcome.after['styler.sheet.insert.hit']).toBe(200)
  })

  it('sheet.reset() clears cache — next insert is a miss', async () => {
    const s = new StyleSheet()
    s.insert('color: red')
    perfHarness.reset()
    s.insert('color: red') // hit
    const hits1 = perfHarness.snapshot()['styler.sheet.insert.hit'] ?? 0
    expect(hits1).toBe(1)

    perfHarness.reset()
    s.reset()
    s.insert('color: red') // after reset — should be a miss (no hit)
    const hits2 = perfHarness.snapshot()['styler.sheet.insert.hit'] ?? 0
    expect(hits2).toBe(0)
  })

  it('sheet LRU-style eviction kicks in at maxCacheSize boundary', () => {
    // Small cache so we can observe eviction
    const s = new StyleSheet({ maxCacheSize: 100 })
    // Insert 110 UNIQUE CSS texts → should trigger eviction
    for (let i = 0; i < 110; i++) {
      s.insert(`prop-${i}: ${i}`)
    }
    // Eviction runs when size > max; after the 11th extra insert, it
    // drops back. Cache size stays close to max (bounded, not unbounded).
    // Actual behavior: can briefly hit max+1 since evict-then-set.
    expect(s.cacheSize).toBeLessThanOrEqual(101)
    // And definitely far below the raw 110 unique insertions.
    expect(s.cacheSize).toBeLessThan(110)
  })

  it('different styler sheet instances are independent', async () => {
    const a = new StyleSheet()
    const b = new StyleSheet()
    a.insert('color: red')
    const outcome = await perfHarness.record('independent', () => {
      b.insert('color: red') // b's cache is EMPTY — miss
    })
    expect(outcome.after['styler.sheet.insert']).toBe(1)
    expect(outcome.after['styler.sheet.insert.hit']).toBeFalsy()
  })

  it('singleton sheet is SHARED across consumers (by design)', async () => {
    // If two places use the default `sheet` singleton, they share the
    // cache. This is intentional for de-duplication across styled() calls.
    sheet.insert('background: red')
    perfHarness.reset()
    sheet.insert('background: red') // shared cache → hit
    expect(perfHarness.snapshot()['styler.sheet.insert.hit']).toBe(1)
  })
})
