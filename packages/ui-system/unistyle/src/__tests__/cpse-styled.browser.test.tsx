/** @jsxImportSource @pyreon/core */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { sheet, styled } from '@pyreon/styler'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cpseStyled } from '../cpse-styled'

/**
 * Real-Chromium proof for `cpseStyled` — the complete CPSE mechanism on a
 * REAL rendered component. See
 * `.claude/audits/custom-property-style-extraction-2026-06-22.md`.
 *
 *   1. O(N)→O(1) — N instances with N DISTINCT values share ONE className +
 *      ONE CSS rule and pay ONE `styler.resolve` (cached by property-set),
 *      while rendering N correct distinct computed values.
 *   2. PARITY — a cpseStyled instance computes the SAME style as a classic
 *      `styled` component with the value baked in.
 *   3. NESTING-SAFE — nested instances each render their own value.
 *   4. DYNAMIC — a signal-driven value updates the computed style with ZERO
 *      additional `styler.resolve` (the class is value-agnostic → never
 *      re-resolved/re-inserted).
 */

type Sink = { __pyreon_count__?: (name: string, n?: number) => void }
const g = globalThis as Sink
const unmounts: Array<() => void> = []
const mount = (vnode: ReturnType<typeof h>): HTMLElement => {
  const m = mountInBrowser(vnode)
  unmounts.push(m.unmount)
  return m.container as HTMLElement
}

beforeEach(() => {
  delete g.__pyreon_count__
})
afterEach(() => {
  for (const u of unmounts) u()
  unmounts.length = 0
  delete g.__pyreon_count__
  sheet.clearAll()
})

const PX = [8, 16, 24, 36, 48]

describe('cpseStyled in real Chromium', () => {
  it('O(N)→O(1): N distinct values → 1 className, 1 resolve, N correct computed values', () => {
    const Box = cpseStyled('div')
    let resolves = 0
    const classes = new Set<string>()
    g.__pyreon_count__ = (name) => {
      if (name === 'styler.resolve') resolves++
    }

    const els: HTMLElement[] = []
    PX.forEach((px, i) => {
      const root = mount(h(Box, { styles: { padding: px }, id: `b${i}` }))
      const el = root.querySelector<HTMLElement>(`#b${i}`)!
      els.push(el)
      classes.add(el.className.trim())
    })

    // ONE shared className across all N distinct-value instances…
    expect(classes.size).toBe(1)
    // …ONE styler.resolve total (property-set cached after the first)…
    expect(resolves).toBe(1)
    // …yet N correct, DISTINCT computed values.
    els.forEach((el, i) => expect(getComputedStyle(el).paddingTop).toBe(`${PX[i]}px`))
  })

  it('PARITY: cpseStyled computes the same as classic styled with the value baked in', () => {
    const Box = cpseStyled('div')
    const Classic = styled('div')`
      padding: 2.25rem;
    `
    const cpseRoot = mount(h(Box, { styles: { padding: 36 }, id: 'cpse' }))
    const classicRoot = mount(h(Classic, { id: 'classic' }))
    const cpseEl = cpseRoot.querySelector<HTMLElement>('#cpse')!
    const classicEl = classicRoot.querySelector<HTMLElement>('#classic')!
    expect(getComputedStyle(cpseEl).paddingTop).toBe('36px')
    expect(getComputedStyle(cpseEl).paddingTop).toBe(getComputedStyle(classicEl).paddingTop)
  })

  it('NESTING-SAFE: nested cpseStyled instances each render their own value', () => {
    const Box = cpseStyled('div')
    const root = mount(
      h(Box, { styles: { padding: 32 }, id: 'outer' }, h(Box, { styles: { padding: 8 }, id: 'inner' })),
    )
    const outer = root.querySelector<HTMLElement>('#outer')!
    const inner = root.querySelector<HTMLElement>('#inner')!
    expect(getComputedStyle(outer).paddingTop).toBe('32px')
    expect(getComputedStyle(inner).paddingTop).toBe('8px')
  })

  it('DYNAMIC: signal value updates computed style with ZERO extra styler.resolve', () => {
    const Box = cpseStyled('div')
    const pad = signal(8)
    const root = mount(h(Box, { styles: () => ({ padding: pad() }), id: 'dyn' }))
    const el = root.querySelector<HTMLElement>('#dyn')!
    expect(getComputedStyle(el).paddingTop).toBe('8px')

    let resolves = 0
    g.__pyreon_count__ = (name) => {
      if (name === 'styler.resolve') resolves++
    }
    pad.set(40)
    expect(getComputedStyle(el).paddingTop).toBe('40px') // updated in place
    pad.set(64)
    expect(getComputedStyle(el).paddingTop).toBe('64px')
    expect(resolves).toBe(0) // value-agnostic class never re-resolved
  })
})
