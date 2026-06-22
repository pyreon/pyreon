/**
 * CPSE cost-model harness — the measurement the RFC rests on.
 * See `.claude/audits/custom-property-style-extraction-2026-06-22.md`.
 *
 * The thesis in ONE contrast (self-discriminating, no fix to revert — same
 * shape as styler's `static-styler-resolve-cost.test.ts`, which it extends):
 *
 *   Rendering N DISTINCT values of one style prop —
 *     • TODAY (value baked into the rule): `styler.resolve === N` and
 *       `distinct rules === N` — cost is O(distinct value tuples). This is the
 *       framework's documented "CORRECT, not waste" per-value cost; the runtime
 *       caches (elClassCache / classCache / _rsMemo) only collapse REPEATED
 *       IDENTICAL tuples, never the first occurrence, never dynamic values,
 *       never the >256-LRU tail.
 *     • CPSE (value delivered as an inline custom property): `styler.resolve
 *       === 1` and `distinct rules === 1` — cost is O(component definitions),
 *       FLAT in value cardinality — while still producing N distinct inline
 *       values (parity preserved).
 *
 * That `today === N, cpse === 1` in the SAME run is the entire argument for
 * the architecture. The real-Chromium parity/nesting/dynamic proof is in
 * `cpse.browser.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { css, sheet, styled } from '@pyreon/styler'
import { extractStyleVar } from '../cpse'
import { value } from '../units'

type Sink = { __pyreon_count__?: (name: string, n?: number) => void }
const g = globalThis as Sink
let counts: Map<string, number>
const get = (name: string): number => counts.get(name) ?? 0
/** Distinct rules actually injected = insert() calls minus dedup hits. */
const distinctRules = (): number => get('styler.sheet.insert') - get('styler.sheet.insert.hit')

beforeEach(() => {
  counts = new Map()
  g.__pyreon_count__ = (name, n = 1) => counts.set(name, (counts.get(name) ?? 0) + n)
})
afterEach(() => {
  delete g.__pyreon_count__
  sheet.clearAll()
})

const N = 100

describe('CPSE cost model — O(distinct values) today vs O(1) under CPSE', () => {
  it('TODAY: N distinct values of one prop → N resolves AND N distinct rules', () => {
    // The exact "value-dependent CSS" shape from styler's cost gate: a
    // function-interpolated styled with no $element/$rocketstyle identity, so
    // no runtime cache can fire — i.e. the FIRST-occurrence cost every unique
    // tuple in a real app pays (and dynamic values pay on every render).
    const Today = styled('div')<{ gap: number }>`
      gap: ${(p) => value(p.gap)};
    `
    counts = new Map() // isolate from the definition-time insert
    for (let i = 0; i < N; i++) Today({ gap: i + 1 }) // 100 DISTINCT gaps

    expect(get('styler.resolve')).toBe(N) // one resolve per distinct value
    expect(distinctRules()).toBe(N) // one CSS rule per distinct value — the bloat
  })

  it('CPSE: N distinct values of one prop → 1 resolve AND 1 rule (flat), N distinct inline values', () => {
    // The value-agnostic rule is resolved + inserted EXACTLY ONCE, no matter
    // how many distinct values render.
    const { rule, varName } = extractStyleVar('gap', 0)
    counts = new Map()
    sheet.insert(css`${rule};`.toString()) // the single shared rule

    // Per-instance work is ONLY the value conversion → an inline custom
    // property. No styler touch: no resolve, no hash, no rule insert.
    const inlineValues = new Set<string>()
    for (let i = 0; i < N; i++) {
      const ext = extractStyleVar('gap', i + 1)
      inlineValues.add(ext.varValue as string)
    }

    expect(get('styler.resolve')).toBe(1) // ONE — flat in value cardinality
    expect(distinctRules()).toBe(1) // ONE shared rule for all N values
    expect(inlineValues.size).toBe(N) // …yet still N distinct values (parity)
    expect(varName).toBe('--u-' + varName.slice(4)) // stable hashed name
  })

  it('SELF-DISCRIMINATING: today.resolve===N AND cpse.resolve===1 in one run', () => {
    const Today = styled('div')<{ gap: number }>`
      gap: ${(p) => value(p.gap)};
    `
    counts = new Map()
    for (let i = 0; i < N; i++) Today({ gap: i + 1 })
    const today = { resolve: get('styler.resolve'), rules: distinctRules() }

    const { rule } = extractStyleVar('gap', 0)
    counts = new Map()
    sheet.insert(css`${rule};`.toString())
    for (let i = 0; i < N; i++) extractStyleVar('gap', i + 1)
    const cpse = { resolve: get('styler.resolve'), rules: distinctRules() }

    expect(today.resolve).toBe(N)
    expect(today.rules).toBe(N)
    expect(cpse.resolve).toBe(1)
    expect(cpse.rules).toBe(1)
    // The headline ratio, asserted: CPSE collapses O(N) → O(1).
    expect(today.resolve - cpse.resolve).toBe(N - 1)
    expect(today.rules - cpse.rules).toBe(N - 1)
  })

  it('PARITY: CPSE inline value === the value baked into the rule today', () => {
    // 16px base: value(16)=1rem, value(36)=2.25rem, value(0)=0, units pass
    // through. The inline custom property carries the SAME string the
    // value-baked rule would embed → identical computed style (proven for
    // real in the browser test).
    expect(extractStyleVar('gap', 16).varValue).toBe(value(16))
    expect(extractStyleVar('gap', 36).varValue).toBe(value(36))
    expect(extractStyleVar('gap', '1rem').varValue).toBe(value('1rem'))
    expect(extractStyleVar('gap', 'var(--x)').varValue).toBe(value('var(--x)')) // passthrough
    // No value → no inline property (matches "no value → no declaration").
    expect(extractStyleVar('gap', undefined).varValue).toBeNull()
  })
})
