/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium lock for CalendarBase's reactive locale (B10).
 *
 * The three Intl.DateTimeFormat formatters used to be built ONCE at mount from
 * an eager `own.locale` read — a runtime locale switch (i18n language change)
 * required a full remount. `localeInfo()` now reads the prop per call and
 * memoizes the formatter bundle per locale string, so a getter-shaped reactive
 * `locale` prop re-derives the month label, weekday headers, and cell
 * aria-labels in place.
 *
 * Also locks the locale-derived `firstDayOfWeek`: when the prop is omitted the
 * first day comes from `Intl.Locale` week info (7→0 Sunday mapping;
 * `getWeekInfo()` fallback for Firefox), explicit prop still wins, and the
 * historical default of 1 (Monday) applies when the API is unavailable —
 * feature-detected below, skipped gracefully when absent.
 *
 * `open`-style getter props work in this harness (this package's browser config
 * uses the plain oxc JSX transform, so tests hand-build getter props the way
 * the reactive-prop compiler would).
 *
 * Bisect (recorded in the PR): revert CalendarBase to mount-time formatter
 * consts → the reactive-flip specs fail with the label frozen at the mount
 * locale ('March 2026' instead of 'März 2026'); revert the firstDay derivation
 * to `?? 1` → the de-DE/en-US weekday-order specs fail.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { CalendarBase, type CalendarDay, type CalendarState } from './CalendarBase'

// March discriminates the locales: en-US "March 2026" vs de-DE "März 2026"
// (August is spelled identically in both).
const MARCH: { year: number; month: number; day: number } = { year: 2026, month: 2, day: 15 }

const nextFrame = (): Promise<void> =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

// Chromium/Safari ship `Intl.Locale#weekInfo` (accessor); Firefox ships the
// spec's `getWeekInfo()` method. Skip the derivation specs when neither exists.
const hasWeekInfo = ((): boolean => {
  try {
    const loc = new Intl.Locale('de-DE') as Intl.Locale & {
      weekInfo?: { firstDay?: number }
      getWeekInfo?: () => { firstDay?: number }
    }
    return typeof (loc.weekInfo ?? loc.getWeekInfo?.())?.firstDay === 'number'
  } catch {
    return false
  }
})()

function mountCalendar(props: Record<string, unknown>): {
  container: HTMLElement
  unmount: () => void
  state: () => CalendarState
} {
  let st: CalendarState | undefined
  // MUTATE the caller's props object — a `{ ...props }` spread would FIRE a
  // getter-shaped `locale` and freeze it to a static value (the documented
  // reactive-prop spread anti-pattern), false-failing the reactive specs.
  if (!('defaultValue' in props)) props.defaultValue = MARCH
  props.children = (s: CalendarState) => {
    st = s
    return h(
      'div',
      s.rootProps(),
      h(
        'div',
        s.gridProps(),
        ...s
          .days()
          .flat()
          .map((day: CalendarDay) => h('button', { ...s.getDayProps(day) }, String(day.date.day))),
      ),
    )
  }
  const { container, unmount } = mountInBrowser(h(CalendarBase as never, props))
  return { container, unmount, state: () => st! }
}

describe('CalendarBase — locale', () => {
  it("renders a German month label for locale 'de-DE'", () => {
    const { container, unmount, state } = mountCalendar({ locale: 'de-DE' })
    expect(state().monthLabel()).toBe('März 2026')
    const grid = container.querySelector('[role="grid"]')!
    expect(grid.getAttribute('aria-label')).toBe('März 2026')
    unmount()
  })

  it('a getter-shaped reactive locale prop re-derives month label, weekdays, and cell aria-labels', async () => {
    const locale = signal('en-US')
    const props: Record<string, unknown> = {}
    Object.defineProperty(props, 'locale', {
      get: () => locale(),
      enumerable: true,
      configurable: true,
    })
    const { container, unmount, state } = mountCalendar(props)

    const grid = () => container.querySelector('[role="grid"]')!
    const day15 = () =>
      [...container.querySelectorAll('[role="gridcell"]')].find(
        (c) => c.textContent === '15' && c.getAttribute('aria-selected') === 'true',
      )!

    expect(grid().getAttribute('aria-label')).toBe('March 2026')
    expect(day15().getAttribute('aria-label')).toContain('March')

    locale.set('de-DE')
    await nextFrame()

    // Formerly FROZEN at the mount locale — the formatters were mount-time consts.
    expect(grid().getAttribute('aria-label')).toBe('März 2026')
    expect(day15().getAttribute('aria-label')).toContain('März')
    // Weekday headers re-derive too (German short weekday names).
    expect(state().weekdays().join(' ')).toMatch(/Mo/)
    expect(state().weekdays().join(' ')).not.toMatch(/Sun/)
    unmount()
  })

  it.skipIf(!hasWeekInfo)(
    "derives firstDayOfWeek=Monday for 'de-DE' when the prop is omitted",
    () => {
      const { unmount, state } = mountCalendar({ locale: 'de-DE' })
      // German weeks start on Monday (CLDR firstDay=1).
      expect(state().weekdays()[0]).toMatch(/^Mo/)
      unmount()
    },
  )

  it.skipIf(!hasWeekInfo)(
    "derives firstDayOfWeek=Sunday for 'en-US' (CLDR 7 → JS 0 mapping) when the prop is omitted",
    () => {
      const { unmount, state } = mountCalendar({ locale: 'en-US' })
      expect(state().weekdays()[0]).toMatch(/^Sun/)
      unmount()
    },
  )

  it('an explicit firstDayOfWeek prop wins over the locale derivation', () => {
    const { unmount, state } = mountCalendar({ locale: 'en-US', firstDayOfWeek: 1 })
    expect(state().weekdays()[0]).toMatch(/^Mon/)
    unmount()
  })

  it('memoizes formatters per locale string (two mounts, same locale — labels agree, no per-render rebuild observable)', () => {
    // The memo is a per-instance last-locale cache; from the outside we can only
    // assert the OBSERVABLE contract — repeated reads at the same locale are
    // stable and cheap (same computed result), and a flip back re-derives.
    const locale = signal('de-DE')
    const props: Record<string, unknown> = {}
    Object.defineProperty(props, 'locale', {
      get: () => locale(),
      enumerable: true,
      configurable: true,
    })
    const { unmount, state } = mountCalendar(props)
    const first = state().monthLabel()
    expect(state().monthLabel()).toBe(first)
    locale.set('en-US')
    expect(state().monthLabel()).toBe('March 2026')
    locale.set('de-DE')
    expect(state().monthLabel()).toBe('März 2026')
    unmount()
  })
})
