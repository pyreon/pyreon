/** @jsxImportSource @pyreon/core */
import { h } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { init } from '@pyreon/ui-core'
import { themeToCssVars } from '@pyreon/unistyle'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Element } from '../Element'

// Validates @pyreon/elements under `init({ cssVariables: true })`.
//
// elements has NO theme-value arithmetic (the audit found only Overlay DOM-rect
// math, which is runtime coordinates, not theme tokens) — it consumes theme
// values ONLY through the unistyle value()/makeItResponsive chokepoint, which
// passes var()/calc() strings through untouched. This proves that empirically:
// a var-valued layout prop on a raw <Element> resolves to the real pixels via
// the cascade, with ZERO styler dev-validator findings (no NaN / malformed-var).

const injected: HTMLStyleElement[] = []
const injectRoot = (css: string): void => {
  const el = document.createElement('style')
  el.textContent = css
  document.head.appendChild(el)
  injected.push(el)
}

afterEach(() => {
  for (const el of injected) el.remove()
  injected.length = 0
  init({ cssVariables: false })
  vi.restoreAllMocks()
})

describe('@pyreon/elements under cssVariables', () => {
  it('a var() value flows through the full Element component → styler → resolved CSS, zero validator findings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    init({ cssVariables: true })
    const { vars, css } = themeToCssVars({ rootSize: 16, spacing: { small: 8 } })
    injectRoot(css) // :root { --px-spacing-small: 0.5rem }

    // A var() reference through Element's full pipeline (attrs HOC → styler).
    // (The unistyle value()/makeItResponsive var path is separately locked by
    // the unistyle pass-through contract + coolgrid's real-gap browser spec;
    // here we prove the Element COMPONENT doesn't mangle a var en route.)
    const { container, unmount } = mountInBrowser(
      h(
        Element,
        {
          tag: 'div',
          css: (c: (s: TemplateStringsArray, ...v: unknown[]) => unknown) =>
            c`padding: ${vars.spacing.small}`,
          'data-id': 'el',
        },
        h('span', null, 'hi'),
      ),
    )
    const el = container.querySelector<HTMLElement>('[data-id="el"]')!
    // padding: var(--px-spacing-small) → emitted 0.5rem → :root resolves → 8px
    expect(getComputedStyle(el).paddingTop).toBe('8px')

    // The styler dev validator is live (dev mode) — zero NaN/malformed-var
    // findings proves Element's style pipeline handled the var() cleanly.
    const invalid = warn.mock.calls.filter((c) => String(c[0]).includes('[Pyreon] styler:'))
    expect(invalid).toEqual([])
    unmount()
  })

  it('renders structurally under cssVariables (no breakage from the global flag)', () => {
    init({ cssVariables: true })
    const { container, unmount } = mountInBrowser(
      h(Element, { tag: 'section', 'data-id': 's' }, h('span', null, 'hello')),
    )
    const el = container.querySelector('[data-id="s"]')!
    expect(el.tagName.toLowerCase()).toBe('section')
    expect(el.querySelector('span')?.textContent).toBe('hello')
    unmount()
  })
})
