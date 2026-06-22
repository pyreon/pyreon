/** @jsxImportSource @pyreon/core */
import { sheet } from '@pyreon/styler'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extractStyleVar } from '../cpse'
import { value } from '../units'

/**
 * Real-Chromium correctness proof for Custom-Property Style Extraction.
 * See `.claude/audits/custom-property-style-extraction-2026-06-22.md`.
 *
 * happy-dom does NOT resolve CSS custom properties through the cascade (same
 * reason cssVariables.browser.test.tsx exists), so these are the load-bearing
 * claims — counter parity is proven separately in `cpse-cost-model.test.ts`:
 *
 *   1. PARITY — a CPSE element (value-agnostic rule + inline custom property)
 *      computes the SAME style as baking the value into the rule.
 *   2. ONE RULE / N VALUES — a SINGLE injected rule drives N distinct computed
 *      values (the architecture's whole point, observed in real layout).
 *   3. NESTING-SAFE — a child's own inline custom property wins over an
 *      inherited one, so sharing a var name across nested components never
 *      bleeds (resolves RFC risk §6.2 — downgraded by this test).
 *   4. DYNAMIC, NO RESOLVE — updating the inline value changes computed style
 *      with ZERO additional `styler.resolve` (the dynamic win, counter-backed).
 */

type Sink = { __pyreon_count__?: (name: string, n?: number) => void }
const g = globalThis as Sink
const mounted: HTMLElement[] = []
const mk = (cls?: string): HTMLElement => {
  const el = document.createElement('div')
  if (cls) el.className = cls
  document.body.appendChild(el)
  mounted.push(el)
  return el
}

beforeEach(() => {
  delete g.__pyreon_count__
})
afterEach(() => {
  for (const el of mounted) el.remove()
  mounted.length = 0
  delete g.__pyreon_count__
  sheet.clearAll()
})

const PX = [8, 16, 24, 36, 48] // value() → 0.5/1/1.5/2.25/3 rem → these px at 16px root

describe('CPSE in real Chromium', () => {
  it('PARITY: a CPSE element computes the same padding as the value baked into the rule', () => {
    const { rule, varName } = extractStyleVar('padding-top', 0)
    const cls = sheet.insert(rule) // ONE value-agnostic rule → a class

    for (const px of PX) {
      // CPSE element: value-agnostic class + inline custom property.
      const cpse = mk(cls)
      cpse.style.setProperty(varName, value(px) as string)
      // Baseline element: the value baked directly into the declaration.
      const baked = mk()
      baked.style.paddingTop = value(px) as string

      const cpseComputed = getComputedStyle(cpse).paddingTop
      const bakedComputed = getComputedStyle(baked).paddingTop
      expect(cpseComputed).toBe(`${px}px`) // browser did rem→px
      expect(cpseComputed).toBe(bakedComputed) // …identical to baking it
    }
  })

  it('ONE RULE / N VALUES: a single stylesheet rule drives N distinct computed values', () => {
    const { rule, varName } = extractStyleVar('padding-top', 0)
    const cls = sheet.insert(rule)
    const sheetRulesBefore = countCpseRules(varName)

    const els = PX.map((px) => {
      const el = mk(cls)
      el.style.setProperty(varName, value(px) as string)
      return el
    })

    // Every element renders its own distinct value from the SAME one rule.
    els.forEach((el, i) => expect(getComputedStyle(el).paddingTop).toBe(`${PX[i]}px`))
    // …and there is still exactly ONE rule referencing the var, regardless of
    // how many distinct values rendered (the O(1) property, observed in DOM).
    expect(countCpseRules(varName)).toBe(sheetRulesBefore)
    expect(countCpseRules(varName)).toBe(1)
  })

  it('NESTING-SAFE: a child inline value wins over the parent (shared var name never bleeds)', () => {
    const { rule, varName } = extractStyleVar('padding-top', 0)
    const cls = sheet.insert(rule)

    const parent = mk(cls)
    parent.style.setProperty(varName, value(32) as string) // 2rem → 32px
    const child = document.createElement('div')
    child.className = cls
    child.style.setProperty(varName, value(8) as string) // 0.5rem → 8px
    parent.appendChild(child)
    mounted.push(child)

    // Each element resolves its OWN inline value — the shared var name does
    // NOT cause the parent's value to leak into the child.
    expect(getComputedStyle(parent).paddingTop).toBe('32px')
    expect(getComputedStyle(child).paddingTop).toBe('8px')
  })

  it('DIFFERENT PROPS → DIFFERENT VARS (no cross-property collision)', () => {
    expect(extractStyleVar('padding-top', 1).varName).not.toBe(
      extractStyleVar('margin-top', 1).varName,
    )
  })

  it('DYNAMIC, NO RESOLVE: updating the inline value re-renders with zero styler.resolve', () => {
    const { rule, varName } = extractStyleVar('padding-top', 0)
    const cls = sheet.insert(rule)
    const el = mk(cls)
    el.style.setProperty(varName, value(8) as string)
    expect(getComputedStyle(el).paddingTop).toBe('8px')

    // Install the counter AFTER setup so we measure only the updates.
    let resolves = 0
    g.__pyreon_count__ = (name) => {
      if (name === 'styler.resolve') resolves++
    }

    // 50 "signal updates" — each is one inline custom-property write.
    for (let i = 0; i < 50; i++) {
      el.style.setProperty(varName, value(8 + i) as string)
    }

    expect(getComputedStyle(el).paddingTop).toBe(`${8 + 49}px`) // last value applied
    expect(resolves).toBe(0) // ZERO styler.resolve across all 50 updates
  })
})

/** Count live CSS rules whose body references the given custom-property name. */
function countCpseRules(varName: string): number {
  let n = 0
  for (const ss of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = ss.cssRules
    } catch {
      continue // cross-origin / inaccessible
    }
    for (const r of Array.from(rules)) {
      if (r.cssText.includes(`var(${varName})`)) n++
    }
  }
  return n
}
