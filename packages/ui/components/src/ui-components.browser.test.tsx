import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { init, PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Loader,
  Notification,
  Pagination,
  Tooltip,
} from './index'

/**
 * Real-browser smoke test for `@pyreon/ui-components`.
 *
 * Per the test-environment-parity rule (`pyreon/require-browser-smoke-test`),
 * every browser-categorized package must ship at least one
 * `*.browser.test.*` file. This catches regressions that happy-dom
 * tests can hide: importing a representative rocketstyle component,
 * mounting it in real Chromium, and verifying it produces real DOM.
 *
 * `Button` is the canonical component — exercises rocketstyle
 * (.attrs/.theme/.states/.sizes), styler (CSS-in-JS), elements (`el`
 * base), and unistyle (responsive props) all in one mount. Wrapped
 * in `<PyreonUI theme={theme}>` because rocketstyle's theme chain
 * resolver throws without a theme context — that's the design.
 */
describe('@pyreon/ui-components — browser smoke', () => {
  it('mounts a Button into real DOM with text content', () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(Button as never, { id: 'smoke-btn' }, 'Click me'),
      ),
    )
    const btn = container.querySelector('#smoke-btn')!
    expect(btn).not.toBeNull()
    expect(btn.textContent).toContain('Click me')
    unmount()
    expect(document.getElementById('smoke-btn')).toBeNull()
  })
})

/**
 * Static ARIA landmark/role/name defaults on presentational components that
 * own no `@pyreon/ui-primitives` behavior base (Loader/Pagination/Tooltip are
 * pure styling shells). These attributes flow through the rocketstyle → Element
 * → styler → runtime `applyProps` pipeline, so they must land as real DOM
 * attributes with the CORRECT VALUE. Each spec asserts `getAttribute(...) ===`
 * the expected string — never `hasAttribute` (which passes for both an empty
 * `role=""` and a real `role="status"`, masking a broken value).
 */
describe('@pyreon/ui-components — static ARIA defaults', () => {
  it('Loader carries role="status" + an accessible name (aria-label="Loading")', () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Loader as never, { id: 'a11y-loader' })),
    )
    const el = container.querySelector('#a11y-loader')!
    expect(el).not.toBeNull()
    expect(el.getAttribute('role')).toBe('status')
    expect(el.getAttribute('aria-label')).toBe('Loading')
    unmount()
  })

  it('Loader aria-label is a DEFAULT — a user-supplied aria-label wins', () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Loader as never, { id: 'a11y-loader2', 'aria-label': 'Fetching results' })),
    )
    const el = container.querySelector('#a11y-loader2')!
    expect(el.getAttribute('aria-label')).toBe('Fetching results')
    unmount()
  })

  it('Pagination labels its <nav> landmark (aria-label="Pagination")', () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Pagination as never, { id: 'a11y-pag' })),
    )
    const el = container.querySelector('#a11y-pag')!
    expect(el).not.toBeNull()
    expect(el.tagName.toLowerCase()).toBe('nav')
    expect(el.getAttribute('aria-label')).toBe('Pagination')
    unmount()
  })

  it('Tooltip carries role="tooltip"', () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Tooltip as never, { id: 'a11y-tip' }, 'Hint')),
    )
    const el = container.querySelector('#a11y-tip')!
    expect(el).not.toBeNull()
    expect(el.getAttribute('role')).toBe('tooltip')
    unmount()
  })
})

/**
 * Live-region roles on Alert/Notification + the Breadcrumb navigation landmark
 * (the residual deferred by PR #2214). All values are asserted with
 * `getAttribute(...) === '<string>'` — never `hasAttribute` — because an ARIA
 * live-region role that renders as `role=""` announces NOTHING, so the VALUE is
 * the whole point. `aria-current` is asserted as the literal string `"page"`
 * (a boolean would render value-less `aria-current=""`, which AT ignores).
 */
describe('@pyreon/ui-components — live-region roles + breadcrumb landmark', () => {
  it('Alert default (no state) is a POLITE live region (role="status" + aria-live="polite")', () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Alert as never, { id: 'a11y-alert' }, 'Heads up')),
    )
    const el = container.querySelector('#a11y-alert')!
    expect(el).not.toBeNull()
    expect(el.getAttribute('role')).toBe('status')
    expect(el.getAttribute('aria-live')).toBe('polite')
    unmount()
  })

  it('Alert state="info"/"success" stay POLITE (role="status")', () => {
    for (const state of ['info', 'success'] as const) {
      const { container, unmount } = mountInBrowser(
        h(PyreonUI, { theme }, h(Alert as never, { id: `a11y-alert-${state}`, state }, state)),
      )
      const el = container.querySelector(`#a11y-alert-${state}`)!
      expect(el.getAttribute('role')).toBe('status')
      expect(el.getAttribute('aria-live')).toBe('polite')
      unmount()
    }
  })

  it('Alert state="error"/"warning" become ASSERTIVE (role="alert" + aria-live="assertive")', () => {
    for (const state of ['error', 'warning'] as const) {
      const { container, unmount } = mountInBrowser(
        h(PyreonUI, { theme }, h(Alert as never, { id: `a11y-alert-${state}`, state }, state)),
      )
      const el = container.querySelector(`#a11y-alert-${state}`)!
      expect(el.getAttribute('role')).toBe('alert')
      expect(el.getAttribute('aria-live')).toBe('assertive')
      unmount()
    }
  })

  it('Alert role/aria-live are DEFAULTS — consumer-supplied values win', () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        // A critical error rendered non-interrupting on purpose (author override).
        h(Alert as never, { id: 'a11y-alert-ovr', state: 'error', role: 'log', 'aria-live': 'polite' }, 'x'),
      ),
    )
    const el = container.querySelector('#a11y-alert-ovr')!
    expect(el.getAttribute('role')).toBe('log')
    expect(el.getAttribute('aria-live')).toBe('polite')
    unmount()
  })

  it('Notification is a POLITE live region regardless of severity (role="status" + aria-live="polite")', () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Notification as never, { id: 'a11y-notif', state: 'error' }, 'Saved')),
    )
    const el = container.querySelector('#a11y-notif')!
    expect(el).not.toBeNull()
    expect(el.getAttribute('role')).toBe('status')
    expect(el.getAttribute('aria-live')).toBe('polite')
    unmount()
  })

  it('Notification role is a DEFAULT — a consumer can escalate to role="alert"', () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(Notification as never, { id: 'a11y-notif-ovr', role: 'alert', 'aria-live': 'assertive' }, 'Urgent'),
      ),
    )
    const el = container.querySelector('#a11y-notif-ovr')!
    expect(el.getAttribute('role')).toBe('alert')
    expect(el.getAttribute('aria-live')).toBe('assertive')
    unmount()
  })

  it('Breadcrumb is a <nav aria-label="Breadcrumb"> navigation landmark', () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(
          Breadcrumb as never,
          { id: 'a11y-crumbs' },
          h(BreadcrumbItem as never, { id: 'crumb-home' }, 'Home'),
          h(BreadcrumbItem as never, { id: 'crumb-current', 'aria-current': 'page' }, 'Current'),
        ),
      ),
    )
    const el = container.querySelector('#a11y-crumbs')!
    expect(el).not.toBeNull()
    expect(el.tagName.toLowerCase()).toBe('nav')
    expect(el.getAttribute('aria-label')).toBe('Breadcrumb')
    unmount()
  })

  it('Breadcrumb aria-label is a DEFAULT — a consumer-supplied label wins', () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Breadcrumb as never, { id: 'a11y-crumbs2', 'aria-label': 'You are here' })),
    )
    const el = container.querySelector('#a11y-crumbs2')!
    expect(el.tagName.toLowerCase()).toBe('nav')
    expect(el.getAttribute('aria-label')).toBe('You are here')
    unmount()
  })

  it('BreadcrumbItem forwards aria-current="page" as the literal string (not a value-less boolean)', () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(BreadcrumbItem as never, { id: 'crumb-active', 'aria-current': 'page' }, 'Current'),
      ),
    )
    const el = container.querySelector('#crumb-active')!
    expect(el).not.toBeNull()
    expect(el.getAttribute('aria-current')).toBe('page')
    unmount()
  })
})

describe('@pyreon/ui-components under cssVariables — full default-theme sweep', () => {
  afterEach(() => {
    init({ cssVariables: false })
    vi.restoreAllMocks()
  })

  it('the REAL Button + REAL default theme render under var mode with ZERO invalid CSS', () => {
    // The styler dev validator (NaN / undefined / malformed-var scan) is live
    // in this dev-mode run — a clean mount of the heaviest consumer proves
    // the ENTIRE ui-theme + Button chain (rocketstyle dimensions, elements,
    // unistyle pipeline) is var-safe: no legacy arithmetic, no string-concat.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    init({ cssVariables: true })
    const mode = signal<'light' | 'dark'>('light')
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme, mode: () => mode() } as never,
        h(Button as never, { id: 'var-btn', state: 'primary' }, 'Save'),
      ),
    )
    const btn = container.querySelector<HTMLElement>('#var-btn')!
    expect(btn.textContent).toContain('Save')

    // Computed-style resolution through the var indirection needs a real CSS
    // engine. This file also runs in the node/happy-dom suite (which resolves
    // neither the cascade nor var()), so probe the capability and only assert
    // computed color when CSS actually resolves — the real-Chromium path
    // (test:browser) exercises it fully, and rocketstyle's
    // css-variables-mode.browser.test.tsx locks the computed-color contract.
    // happy-dom (the node suite) doesn't apply styler-injected class rules to
    // computed style, and its getComputedStyle is too inconsistent to probe;
    // detect it by its control global and skip the computed-color assertion
    // there. Real Chromium (test:browser) has no `window.happyDOM`.
    const cssResolves = typeof (window as unknown as { happyDOM?: unknown }).happyDOM === 'undefined'
    if (cssResolves) {
      const cs = getComputedStyle(btn)
      expect(cs.backgroundColor).toMatch(/^rgba?\(/)
      expect(cs.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    }

    // mode flip: zero className churn (the var-mode contract) — both environments.
    const classBefore = btn.className
    mode.set('dark')
    expect(btn.className).toBe(classBefore)

    // zero validator findings across the WHOLE default theme + Button chain
    const invalid = warn.mock.calls.filter((c) => String(c[0]).includes('[Pyreon] styler:'))
    expect(invalid).toEqual([])
    unmount()
  })
})

