/**
 * @vitest-environment happy-dom
 *
 * REPRODUCTION + REGRESSION — `initTheme()` was non-idempotent. Each
 * `<ThemeToggle />` instance called `initTheme()` in its render body, and
 * `initTheme()` registered an `onMount(() => …)` callback. The callback
 * added a `matchMedia('(prefers-color-scheme: dark)').change` listener +
 * an `effect()` to mirror the resolved theme to the document — both
 * pointed at the SAME module-level `_osPrefersDark` signal and the SAME
 * `document.documentElement`.
 *
 * Real-app symptom: an app with 2+ `<ThemeToggle>` widgets (header +
 * footer is a common shape) — or `<ThemeToggle>` mounted alongside an
 * explicit `initTheme()` call in `_layout.tsx` (which the JSDoc literally
 * recommends) — registers N media-query listeners + N effects. Each OS
 * color-scheme flip then fires N redundant updates writing the SAME
 * value to `document.documentElement.dataset.theme` and the SAME value
 * to N favicon links. Pure waste; the work compounds linearly with the
 * count of mounted ThemeToggles.
 *
 * Class D (event-listener pile-up). Fix: refcount-based idempotent
 * setup — first mount runs setup, last unmount runs teardown; mounts
 * 2..N share the single registration.
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetInitThemeForTests, ThemeToggle } from '../theme'

interface MockMediaQueryList {
  matches: boolean
  media: string
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
}

describe('zero/theme — initTheme() is idempotent across N ThemeToggle instances', () => {
  let container: HTMLElement
  let mql: MockMediaQueryList
  let originalMatchMedia: typeof window.matchMedia | undefined

  beforeEach(() => {
    _resetInitThemeForTests()
    container = document.createElement('div')
    document.body.appendChild(container)
    mql = {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    originalMatchMedia = window.matchMedia
    // Cast through unknown — the mock only stubs the fields the theme
    // module actually reads (matches + add/removeEventListener).
    window.matchMedia = (() => mql) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    container.remove()
    if (originalMatchMedia) window.matchMedia = originalMatchMedia
  })

  it('REGRESSION: 3 mounted ThemeToggles register exactly ONE matchMedia listener', () => {
    // Three sibling ThemeToggles — header, sidebar, and footer is the
    // canonical multi-widget case the pre-fix code couldn't dedup.
    mount(
      h('div', null, h(ThemeToggle, null), h(ThemeToggle, null), h(ThemeToggle, null)),
      container,
    )

    // The critical assertion: ONE listener, not three. Pre-fix this is 3.
    expect(mql.addEventListener).toHaveBeenCalledTimes(1)
  })

  it('REGRESSION: 5 mounted ThemeToggles register exactly ONE matchMedia listener', () => {
    // Same shape with a larger N, to make the linear pile-up obvious.
    const children = Array.from({ length: 5 }, () => h(ThemeToggle, null))
    mount(h('div', null, ...children), container)

    expect(mql.addEventListener).toHaveBeenCalledTimes(1)
  })
})
