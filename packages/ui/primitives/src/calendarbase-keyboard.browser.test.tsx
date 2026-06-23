/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium lock for CalendarBase arrow-key roving (the WAI-ARIA date-grid
 * keyboard model). CalendarBase shipped the grid ARIA (role=grid/gridcell,
 * roving tabIndex) but no keyboard handler — a keyboard user couldn't move
 * between days. getDayProps now provides `onKeyDown` (Arrow ±1 day / ±1 week,
 * Home/End week, PageUp/Down ±month) + a `ref` registry so focus moves to the
 * destination cell.
 *
 * Scope of THIS test: WITHIN-month moves (both cells are in the statically-
 * rendered Jan-2026 grid). Month-crossing moves drive a view-signal write +
 * re-render that this package's plain-oxc browser config doesn't reflect in the
 * static render — those are correct by construction (the signal writes happen)
 * but need a reactive consumer to observe; covered by reasoning, not this test.
 *
 * Jan 15 2026 is a Thursday; with firstDayOfWeek=1 the week is Mon Jan 12 … Sun
 * Jan 18, and ±7 (8 / 22) stay in January — so every move below lands on a
 * rendered current-month cell.
 *
 * Bisect: remove the onKeyDown from getDayProps → every move spec fails
 * (activeElement stays on the start cell).
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { CalendarBase, type CalendarDay, type CalendarState } from './CalendarBase'

const nextFrame = (): Promise<void> =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

function mountCalendar(): { container: HTMLElement; unmount: () => void } {
  const { container, unmount } = mountInBrowser(
    h(CalendarBase as never, {
      defaultValue: { year: 2026, month: 0, day: 15 },
      locale: 'en-US',
      firstDayOfWeek: 1,
      children: (state: CalendarState) =>
        h(
          'div',
          { ...state.gridProps(), id: 'cal' },
          ...state
            .days()
            .flat()
            .map((day: CalendarDay) =>
              h(
                'button',
                {
                  ...state.getDayProps(day),
                  'data-day': `${day.date.year}-${day.date.month}-${day.date.day}`,
                  onClick: () => state.select(day.date),
                },
                String(day.date.day),
              ),
            ),
        ),
    }),
  )
  return { container, unmount }
}

function cell(container: HTMLElement, y: number, m: number, d: number): HTMLButtonElement {
  return container.querySelector(`[data-day="${y}-${m}-${d}"]`) as HTMLButtonElement
}

function press(el: HTMLElement, key: string, shift = false): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true }))
}

describe('CalendarBase — arrow-key roving (within month)', () => {
  it('the selected day is the initial roving tab stop (tabIndex 0)', async () => {
    const { container, unmount } = mountCalendar()
    await flush()
    expect(cell(container, 2026, 0, 15).tabIndex).toBe(0)
    // a non-roving current-month day is -1
    expect(cell(container, 2026, 0, 10).tabIndex).toBe(-1)
    unmount()
  })

  it('ArrowRight moves focus to the next day', async () => {
    const { container, unmount } = mountCalendar()
    await flush()
    cell(container, 2026, 0, 15).focus()
    press(cell(container, 2026, 0, 15), 'ArrowRight')
    await nextFrame()
    expect(document.activeElement).toBe(cell(container, 2026, 0, 16))
    unmount()
  })

  it('ArrowLeft moves focus to the previous day', async () => {
    const { container, unmount } = mountCalendar()
    await flush()
    cell(container, 2026, 0, 15).focus()
    press(cell(container, 2026, 0, 15), 'ArrowLeft')
    await nextFrame()
    expect(document.activeElement).toBe(cell(container, 2026, 0, 14))
    unmount()
  })

  it('ArrowDown moves focus one week forward', async () => {
    const { container, unmount } = mountCalendar()
    await flush()
    cell(container, 2026, 0, 15).focus()
    press(cell(container, 2026, 0, 15), 'ArrowDown')
    await nextFrame()
    expect(document.activeElement).toBe(cell(container, 2026, 0, 22))
    unmount()
  })

  it('ArrowUp moves focus one week back', async () => {
    const { container, unmount } = mountCalendar()
    await flush()
    cell(container, 2026, 0, 15).focus()
    press(cell(container, 2026, 0, 15), 'ArrowUp')
    await nextFrame()
    expect(document.activeElement).toBe(cell(container, 2026, 0, 8))
    unmount()
  })

  it('Home moves focus to the start of the week (Mon Jan 12)', async () => {
    const { container, unmount } = mountCalendar()
    await flush()
    cell(container, 2026, 0, 15).focus()
    press(cell(container, 2026, 0, 15), 'Home')
    await nextFrame()
    expect(document.activeElement).toBe(cell(container, 2026, 0, 12))
    unmount()
  })

  it('End moves focus to the end of the week (Sun Jan 18)', async () => {
    const { container, unmount } = mountCalendar()
    await flush()
    cell(container, 2026, 0, 15).focus()
    press(cell(container, 2026, 0, 15), 'End')
    await nextFrame()
    expect(document.activeElement).toBe(cell(container, 2026, 0, 18))
    unmount()
  })
})
