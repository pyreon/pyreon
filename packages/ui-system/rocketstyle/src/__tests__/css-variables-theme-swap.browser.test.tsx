/** @jsxImportSource @pyreon/core */
import { h, useContext } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { sheet, ThemeContext } from '@pyreon/styler'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { init, PyreonUI } from '@pyreon/ui-core'
import '@pyreon/unistyle'
import { afterEach, describe, expect, it } from 'vitest'

// Real-Chromium lock for the cssVariables `:root` block on a THEME swap.
//
// `<PyreonUI>` used to append a `:root{…}` rule for every distinct theme it
// ever saw (`sheet.injectRules([css], css)`, deduped by the whole text and
// never removed). Variable names depend only on the theme PATH, so the
// last-inserted block won the cascade: swapping A -> B -> A inserted nothing
// the third time (A's text was already "injected") and the page kept B. The
// sheet now owns ONE replaceable root-variables slot.

const themeA = { rootSize: 16, breakpoints: { xs: 0 }, spacing: { small: 8 } }
const themeB = { rootSize: 16, breakpoints: { xs: 0 }, spacing: { small: 24 } }

// A theme consumer: the provider derives (and injects) the variables when
// something reads the theme.
function Probe() {
  const getTheme = useContext(ThemeContext) as () => { spacing: { small: string } }

  return h('i', null, () => getTheme().spacing.small)
}

const rootVar = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const rootRuleCount = (): number => {
  let n = 0
  for (const s of Array.from(document.styleSheets)) {
    for (const r of Array.from(s.cssRules)) {
      if (r instanceof CSSStyleRule && r.selectorText === ':root' && r.cssText.includes('--px-'))
        {n++}
    }
  }

  return n
}

afterEach(() => {
  init({ cssVariables: false })
  document.documentElement.removeAttribute('data-theme')
})

describe('PyreonUI cssVariables — theme swap replaces the :root variables', () => {
  it('A -> B -> A shows A again, with one :root rule throughout', () => {
    init({ cssVariables: true })
    const theme = signal<typeof themeA>(themeA)
    const { unmount } = mountInBrowser(
      h(PyreonUI as never, { theme: () => theme() } as never, h(Probe, null)),
    )
    expect(rootVar('--px-spacing-small'), 'A').toBe('0.5rem')
    expect(rootRuleCount(), 'rules after A').toBe(1)

    theme.set(themeB)
    expect(rootVar('--px-spacing-small'), 'B').toBe('1.5rem')
    expect(rootRuleCount(), 'rules after B').toBe(1)

    theme.set(themeA)
    expect(rootVar('--px-spacing-small'), 'A again').toBe('0.5rem')
    expect(rootRuleCount(), 'rules after A again').toBe(1)

    // Many distinct themes: still one rule (it used to grow by one per theme).
    for (let i = 1; i <= 20; i++) theme.set({ ...themeA, spacing: { small: i } })
    expect(rootRuleCount(), 'rules after 20 more themes').toBe(1)
    unmount()
  })

  it('sheet.clearAll() (HMR) keeps the current root variables', () => {
    init({ cssVariables: true })
    const { unmount } = mountInBrowser(h(PyreonUI as never, { theme: themeB } as never, h(Probe, null)))
    expect(rootVar('--px-spacing-small')).toBe('1.5rem')
    sheet.clearAll()
    expect(rootVar('--px-spacing-small')).toBe('1.5rem')
    unmount()
  })
})
