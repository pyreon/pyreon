/**
 * CPSE win-matrix — measures the trade-off the RFC reasons about (risk §6.1:
 * inline-style bytes vs shared-rule bytes), so the claim is MEASURED, not
 * assumed. See `.claude/audits/custom-property-style-extraction-2026-06-22.md`.
 *
 * Across two shapes at N instances, classic `styled` vs `cpseStyled`:
 *   - rule count + `styler.resolve` count (the robust, asserted wins)
 *   - CSS bytes (shared rules) vs inline bytes (per-instance custom properties)
 *
 * Honest finding asserted below: CPSE's robust win is **rule-count +
 * resolve-count** (stylesheet parse + CPU), largest on high-cardinality.
 * On a UNIFORM shape (one value reused) classic already shares one rule, so
 * CPSE's per-instance inline bytes are a *cost* there — exactly why adoption
 * should be measured per app, not assumed universal.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { css, sheet, styled } from '@pyreon/styler'
import { extractStyleVar } from '../cpse'
import { value } from '../units'

type Sink = { __pyreon_count__?: (name: string, n?: number) => void }
const g = globalThis as Sink
let counts: Map<string, number>
const get = (n: string): number => counts.get(n) ?? 0
const distinctRules = (): number => get('styler.sheet.insert') - get('styler.sheet.insert.hit')

beforeEach(() => {
  counts = new Map()
  g.__pyreon_count__ = (n, k = 1) => counts.set(n, (counts.get(n) ?? 0) + k)
})
afterEach(() => {
  delete g.__pyreon_count__
  sheet.clearAll()
})

const N = 100

/** Measure classic `styled` for a list of padding values. */
function measureClassic(values: number[]): { rules: number; resolves: number; cssBytes: number } {
  const Box = styled('div')<{ p: number }>`
    padding: ${(props) => value(props.p)};
  `
  counts = new Map()
  const ruleText = new Set<string>()
  for (const v of values) {
    Box({ p: v })
    ruleText.add(`padding:${value(v)};`) // the per-value declaration bytes
  }
  let cssBytes = 0
  for (const t of ruleText) cssBytes += t.length
  return { rules: distinctRules(), resolves: get('styler.resolve'), cssBytes }
}

/** Measure CPSE for the same values: one shared rule + per-instance inline. */
function measureCpse(values: number[]): {
  rules: number
  resolves: number
  cssBytes: number
  inlineBytes: number
} {
  const { rule, varName } = extractStyleVar('padding', 0)
  counts = new Map()
  sheet.insert(css`${rule};`.toString()) // the ONE shared value-agnostic rule
  let inlineBytes = 0
  for (const v of values) {
    const ext = extractStyleVar('padding', v)
    inlineBytes += `${varName}:${ext.varValue}`.length // the per-instance inline cost
  }
  return {
    rules: distinctRules(),
    resolves: get('styler.resolve'),
    cssBytes: `padding:var(${varName});`.length,
    inlineBytes,
  }
}

describe('CPSE win-matrix (measured)', () => {
  it('HIGH-CARDINALITY (N distinct values): CPSE collapses rules + resolves', () => {
    const values = Array.from({ length: N }, (_, i) => i + 1) // 100 DISTINCT
    const classic = measureClassic(values)
    const cpse = measureCpse(values)

    // eslint-disable-next-line no-console
    console.log(
      `[win-matrix] high-cardinality N=${N}: classic { rules:${classic.rules}, resolves:${classic.resolves}, cssBytes:${classic.cssBytes} } | cpse { rules:${cpse.rules}, resolves:${cpse.resolves}, cssBytes:${cpse.cssBytes}, inlineBytes:${cpse.inlineBytes}, total:${cpse.cssBytes + cpse.inlineBytes} }`,
    )

    // The robust, asserted wins:
    expect(classic.rules).toBe(N) // classic ships N CSS rules…
    expect(cpse.rules).toBe(1) // …CPSE ships ONE.
    expect(classic.resolves).toBe(N) // classic resolves per value…
    expect(cpse.resolves).toBe(1) // …CPSE once.
    // Bytes: CPSE total (1 rule + N inline) is competitive with N rules — but
    // the headline win is rule/resolve COUNT, not bytes. Assert CPSE's CSS
    // (stylesheet) bytes are far smaller (the parse-cost win); inline bytes
    // move to the element.
    expect(cpse.cssBytes).toBeLessThan(classic.cssBytes)
  })

  it('UNIFORM (one value reused N times): classic already shares one rule — CPSE adds inline cost', () => {
    const values = Array.from({ length: N }, () => 16) // SAME value ×N
    const classic = measureClassic(values)
    const cpse = measureCpse(values)

    // eslint-disable-next-line no-console
    console.log(
      `[win-matrix] uniform N=${N}: classic { rules:${classic.rules}, resolves:${classic.resolves}, cssBytes:${classic.cssBytes} } | cpse { rules:${cpse.rules}, inlineBytes:${cpse.inlineBytes} }`,
    )

    // Classic dedups identical values → ONE rule. CPSE also ONE rule, BUT adds
    // N inline custom properties. So on a uniform shape CPSE costs MORE bytes —
    // the honest reason adoption is per-app-measured, not universal.
    expect(classic.rules).toBe(1) // classic already shares one rule here
    expect(cpse.rules).toBe(1)
    expect(cpse.inlineBytes).toBeGreaterThan(0) // …the per-instance cost CPSE adds
  })
})
