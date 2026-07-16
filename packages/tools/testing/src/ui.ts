/**
 * `@pyreon/testing/ui` — test helpers for the Pyreon UI system
 * (`@pyreon/ui-core`'s `<PyreonUI>` provider).
 *
 *   renderWithTheme(ui, { theme, mode }) — auto-wraps `<PyreonUI>` so
 *   rocketstyle / styler / ui-components under test resolve a real theme;
 *   returns the normal render result plus `setMode('dark')` (backed by a
 *   signal, so components re-style reactively, no remount).
 *
 *   expectComputedStyle(el, { color: 'red' }) — fluent computed-style
 *   assertion with VALUE NORMALIZATION (both sides round-trip through the
 *   engine's own CSS parser, so `'red'`, `'#ff0000'` and `'rgb(255, 0, 0)'`
 *   compare equal regardless of which form the engine reports).
 *
 * HONEST LIMIT (test-environment parity): happy-dom's `getComputedStyle` is a
 * partial implementation — inheritance, cascade layers, media queries and
 * shorthand expansion are incomplete, so class-based computed-style
 * assertions can false-negative there. Treat computed-style assertions as
 * REAL-BROWSER territory (`*.browser.test.tsx`); in happy-dom prefer
 * structural assertions (class presence, DOM shape).
 *
 * Requires the optional peer `@pyreon/ui-core`.
 */
import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import type { PyreonUIProps, ThemeModeInput } from '@pyreon/ui-core'
import { PyreonUI } from '@pyreon/ui-core'
import type { RenderOptions, RenderResult } from '@pyreon/testing'
import { render } from '@pyreon/testing'

// ─── renderWithTheme ────────────────────────────────────────────────────────

export interface RenderWithThemeOptions extends RenderOptions {
  /** Theme object passed to `<PyreonUI theme>`. Optional — PyreonUI falls back to `{}`. */
  theme?: PyreonUIProps['theme']
  /** Initial color mode. Default `'light'`. */
  mode?: ThemeModeInput
  /** Compose an OUTER wrapper around the provider tree (e.g. a RouterProvider). */
  wrapper?: (children: VNodeChild) => VNodeChild
}

export type RenderWithThemeResult = RenderResult & {
  /** Flip the color mode reactively — components re-style in place, no remount. */
  setMode: (mode: ThemeModeInput) => void
  /** Read the current mode input. */
  mode: () => ThemeModeInput
}

/**
 * Render `ui` wrapped in `<PyreonUI theme mode>`.
 *
 * @example
 *   const { getByRole, setMode } = renderWithTheme(<Button state="primary">Go</Button>, {
 *     theme: myTheme,
 *   })
 *   setMode('dark') // reactive — same elements, new classes
 */
export function renderWithTheme(
  ui: VNodeChild,
  options: RenderWithThemeOptions = {},
): RenderWithThemeResult {
  const { theme, mode = 'light', wrapper, ...renderOptions } = options
  const modeSignal = signal<ThemeModeInput>(mode)

  // `mode` as a getter → PyreonUI tracks it reactively (its documented
  // reactive-mode-switching contract), so setMode() re-styles in place.
  const tree = h(PyreonUI, { theme, mode: () => modeSignal() }, ui)
  const result = render(wrapper ? wrapper(tree) : tree, renderOptions)

  return {
    ...result,
    setMode: (next) => modeSignal.set(next),
    mode: () => modeSignal(),
  }
}

// ─── expectComputedStyle ────────────────────────────────────────────────────

/**
 * Normalize a CSS value through the engine's COMPUTED-value serialization:
 * the value is set on a probe element attached to `document.body` and read
 * back via `getComputedStyle`. In a real browser that canonicalizes colors —
 * `'red'`, `'#ff0000'` and `'rgb(255, 0, 0)'` all serialize to
 * `'rgb(255, 0, 0)'` (an inline-style round-trip would NOT: `el.style`
 * preserves the SPECIFIED keyword, a divergence real Chromium surfaced).
 *
 * Rejection detection uses `probe.style` (the parser): a value the engine
 * refuses falls back to the trimmed-lowercase raw string, so comparisons
 * degrade gracefully (happy-dom's partial parser) instead of collapsing to
 * the property's computed DEFAULT.
 *
 * Caveat: computed-value serialization resolves RELATIVE units against the
 * probe's body-level context — prefer absolute units (`px`, numeric weights,
 * `rgb()`/hex/named colors) in expectations.
 */
export function normalizeCssValue(property: string, value: string): string {
  const probe = document.createElement('div')
  probe.style.setProperty(property, value)
  if (probe.style.getPropertyValue(property) === '') {
    // Engine rejected the value — raw-string fallback.
    return value.trim().toLowerCase()
  }
  document.body.appendChild(probe)
  try {
    const computed = getComputedStyle(probe).getPropertyValue(property)
    return (computed !== '' ? computed : value).trim().toLowerCase()
  } finally {
    probe.remove()
  }
}

/**
 * Fluent computed-style assertion with value normalization on BOTH sides.
 * Throws a `[Pyreon]`-prefixed error naming the property, expected and actual
 * (raw + normalized) on mismatch.
 *
 * Prefer this in REAL-BROWSER tests — see the module docstring for
 * happy-dom's computed-style limits.
 *
 * @example
 *   expectComputedStyle(button, { color: 'rgb(255, 0, 0)', 'font-weight': '700' })
 */
export function expectComputedStyle(
  element: Element,
  expected: Record<string, string | number>,
): void {
  const computed = getComputedStyle(element)
  for (const rawProperty of Object.keys(expected)) {
    // Accept camelCase and kebab-case property names.
    const property = rawProperty.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
    const want = String(expected[rawProperty])
    const actualRaw = computed.getPropertyValue(property)
    const actual = normalizeCssValue(property, actualRaw)
    const wanted = normalizeCssValue(property, want)
    if (actual !== wanted) {
      throw new Error(
        `[Pyreon] expectComputedStyle: expected "${property}" to be "${want}" (normalized "${wanted}"), got "${actualRaw}" (normalized "${actual}")`,
      )
    }
  }
}
