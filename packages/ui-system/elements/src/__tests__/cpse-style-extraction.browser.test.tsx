/** @jsxImportSource @pyreon/core */
import { h } from '@pyreon/core'
import { setStyleExtraction, sheet, styled } from '@pyreon/styler'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { cpseRewrite } from '@pyreon/unistyle'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Element } from '../Element'

/**
 * Real-Chromium proof for the CPSE default-pipeline integration in styler's
 * `doResolve` (wired via `setStyleExtraction`, the path `init({ styleExtraction:
 * true })` enables through PyreonUI). See
 * `.claude/audits/custom-property-style-extraction-2026-06-22.md`.
 *
 * Self-discriminating (the two specs ARE the bisect — no fix to revert):
 *   - flag ON  → a function-interpolated `styled` resolves to a value-agnostic
 *     rule + inline custom property; N distinct values share ONE class.
 *   - flag OFF → classic: the value is baked into the rule, N distinct values →
 *     N distinct classes, no `--u-` inline var.
 *
 * The flag is a process-global; `setStyleExtraction(false)` resets it in
 * before/afterEach so neither spec leaks into the other or into sibling files.
 */

beforeEach(() => setStyleExtraction(false))
afterEach(() => {
  setStyleExtraction(false)
  sheet.clearAll()
})

const PX = ['8px', '16px', '24px']

describe('CPSE default-pipeline integration (styler doResolve)', () => {
  it('flag ON: value-agnostic rule + inline custom property; N distinct values → ONE class', () => {
    setStyleExtraction(true, cpseRewrite)
    const Box = styled('div')<{ p: string }>`
      padding: ${(props: { p: string }) => props.p};
    `
    const classes = new Set<string>()
    PX.forEach((px, i) => {
      const m = mountInBrowser(h(Box, { p: px, id: `on${i}` }))
      const el = m.container.querySelector<HTMLElement>(`#on${i}`)!
      expect(getComputedStyle(el).paddingTop).toBe(px) // correct computed value
      expect(el.getAttribute('style') ?? '').toContain('--u-') // inline custom property
      classes.add(el.className.trim())
    })
    expect(classes.size).toBe(1) // ONE value-agnostic class for all distinct values
  })

  it('flag OFF: classic value-baked rule, N distinct values → N classes, no --u var', () => {
    // flag reset to false in beforeEach
    const Box = styled('div')<{ p: string }>`
      padding: ${(props: { p: string }) => props.p};
    `
    const classes = new Set<string>()
    PX.forEach((px, i) => {
      const m = mountInBrowser(h(Box, { p: px, id: `off${i}` }))
      const el = m.container.querySelector<HTMLElement>(`#off${i}`)!
      expect(getComputedStyle(el).paddingTop).toBe(px)
      expect(el.getAttribute('style') ?? '').not.toContain('--u-') // no inline var (classic)
      classes.add(el.className.trim())
    })
    expect(classes.size).toBe(3) // distinct classes per value (the O(N) classic cost)
  })

  it('flag ON: a real <Element> fires CPSE — renders correctly, distinct values share ONE class, cache-hit keeps vars', () => {
    setStyleExtraction(true, cpseRewrite)
    const a = mountInBrowser(h(Element, { gap: 8, 'data-testid': 'ea' }))
    const b = mountInBrowser(h(Element, { gap: 16, 'data-testid': 'eb' }))
    const elA = a.container.querySelector<HTMLElement>('[data-testid="ea"]')!
    const elB = b.container.querySelector<HTMLElement>('[data-testid="eb"]')!
    // CPSE fires on the real Element (its layout CSS is flat).
    expect((elA.getAttribute('style') ?? '').includes('--u-')).toBe(true)
    // Renders correctly via the var indirection — `display` is a layout decl on
    // THIS element (Element's flex `display` → `var(--u-…)` + inline value).
    expect(getComputedStyle(elA).display).toBe('inline-flex')
    // elClassCache path: distinct gap values share ONE value-agnostic class.
    expect(elA.className.trim()).toBe(elB.className.trim())
    // cpseVarsCache survives the elClassCache HIT: a 2nd Element with the SAME
    // $element (gap: 8) still receives its inline vars + renders correctly.
    const c = mountInBrowser(h(Element, { gap: 8, 'data-testid': 'ec' }))
    const elC = c.container.querySelector<HTMLElement>('[data-testid="ec"]')!
    expect((elC.getAttribute('style') ?? '').includes('--u-')).toBe(true)
    expect(getComputedStyle(elC).display).toBe('inline-flex')
  })

  it('flag ON: a pre-existing inline style is preserved alongside the CPSE vars', () => {
    setStyleExtraction(true, cpseRewrite)
    const Box = styled('div')<{ p: string }>`
      padding: ${(props: { p: string }) => props.p};
    `
    const m = mountInBrowser(h(Box, { p: '16px', id: 'merge', style: { color: 'rgb(1, 2, 3)' } }))
    const el = m.container.querySelector<HTMLElement>('#merge')!
    expect(getComputedStyle(el).paddingTop).toBe('16px') // CPSE var applied
    expect(getComputedStyle(el).color).toBe('rgb(1, 2, 3)') // user style not clobbered
  })
})
