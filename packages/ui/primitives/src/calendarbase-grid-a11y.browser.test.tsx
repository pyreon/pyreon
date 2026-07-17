import { For, h } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { CalendarBase } from './CalendarBase'
import type { CalendarDate, CalendarDay, CalendarState } from './CalendarBase'

/**
 * Calendar date-grid: the roving tabindex must stay live under a KEYED list.
 *
 * `getDayProps` used to return EAGER snapshots. That only appeared to work
 * because the sole existing wiring re-rendered the grid inside a reactive
 * accessor, re-reading them by remounting all 42 cells on every keystroke.
 * Under a keyed `<For>` — where surviving cells are correctly NOT re-rendered —
 * they froze: ArrowRight moved DOM focus to the next day while `tabIndex=0`
 * stayed on the old one, so tabbing away and back returned to the wrong date.
 *
 * Unlike TreeBase (#2393), CalendarBase ALREADY moves real DOM focus, via a
 * cell-element registry + rAF (deferred so a month-crossing re-render has
 * re-registered the destination first). Only the props were wrong here.
 */
const KEY = (d: CalendarDate) => `${d.year}-${d.month}-${d.day}`
const START: CalendarDate = { year: 2026, month: 7, day: 15 }

function mountCalendar() {
  const { container } = mountInBrowser(
    h(CalendarBase as never, {
      defaultValue: START,
      children: (s: CalendarState) =>
        h(
          'div',
          s.rootProps(),
          h(
            'div',
            s.gridProps(),
            h(For as never, {
              each: () => s.days().flat(),
              by: (d: CalendarDay) => KEY(d.date),
              children: (day: CalendarDay) =>
                h(
                  'button',
                  { ...s.getDayProps(day), onClick: () => s.select(day.date) },
                  String(day.date.day),
                ),
            }),
          ),
        ),
    }),
  )
  const cells = () => [...container.querySelectorAll('[role="gridcell"]')] as HTMLElement[]
  const roving = () => cells().filter((c) => c.getAttribute('tabindex') === '0')
  const press = (from: HTMLElement, key: string, shiftKey = false) =>
    from.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }))
  const raf = () => new Promise((r) => requestAnimationFrame(() => r(null)))
  return { container, cells, roving, press, raf }
}

describe('CalendarBase — grid a11y survives a keyed list', () => {
  it('exposes the date-grid roles', () => {
    const { container, cells } = mountCalendar()
    expect(container.querySelector('[role="grid"]')).toBeTruthy()
    expect(cells().length).toBeGreaterThan(27)
  })

  it('keeps EXACTLY ONE roving tabindex, and it FOLLOWS the arrows', async () => {
    const { roving, press, raf } = mountCalendar()
    expect(roving().map((c) => c.textContent)).toEqual(['15'])
    press(roving()[0]!, 'ArrowRight')
    await raf()
    // Frozen snapshots left this on '15' while focus sat on '16'.
    expect(roving().map((c) => c.textContent)).toEqual(['16'])
    press(roving()[0]!, 'ArrowDown')
    await raf()
    expect(roving().map((c) => c.textContent)).toEqual(['23']) // +1 week
  })

  it('moves real DOM focus with the roving tabindex (they agree)', async () => {
    const { roving, press, raf } = mountCalendar()
    roving()[0]!.focus()
    press(roving()[0]!, 'ArrowRight')
    await raf()
    expect(document.activeElement).not.toBe(document.body)
    // The exact inconsistency: focus on one cell, tabIndex=0 on another.
    expect(document.activeElement).toBe(roving()[0]!)
  })

  it('keeps aria-selected live without re-creating the cell', () => {
    const { cells, roving } = mountCalendar()
    const cell = roving()[0]!
    expect(cell.getAttribute('aria-selected')).toBe('true') // defaultValue
    const other = cells().find((c) => c.textContent === '20')!
    other.click()
    // Reads the SELECTION SIGNAL, not the snapshot `day.isSelected` — a
    // surviving <For> row keeps its ORIGINAL day object, which never updates.
    expect(other.getAttribute('aria-selected')).toBe('true')
    expect(cell.getAttribute('aria-selected')).toBe('false')
    // …and the cells were never re-created.
    expect(roving().length).toBe(1)
  })

  it('keeps the grid aria-label live across month navigation', async () => {
    let st: CalendarState | undefined
    const { container } = mountInBrowser(
      h(CalendarBase as never, {
        defaultValue: START,
        children: (s: CalendarState) => {
          st = s
          return h(
            'div',
            s.rootProps(),
            h(
              'div',
              s.gridProps(),
              h(For as never, {
                each: () => s.days().flat(),
                by: (d: CalendarDay) => KEY(d.date),
                children: (day: CalendarDay) => h('button', { ...s.getDayProps(day) }, String(day.date.day)),
              }),
            ),
          )
        },
      }),
    )
    const grid = () => container.querySelector('[role="grid"]') as HTMLElement
    expect(grid().getAttribute('aria-label')).toBe('August 2026')
    st!.nextMonth()
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    // `gridProps()` is spread ONCE, so a plain string froze here at "August
    // 2026" while the state said September — the grid announced the wrong month
    // for the rest of the session.
    expect(grid().getAttribute('aria-label')).toBe(st!.monthLabel())
    expect(grid().getAttribute('aria-label')).toBe('September 2026')
  })

  it('carries a human-readable date label, not a bare number', () => {
    const { roving } = mountCalendar()
    const label = roving()[0]!.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/15/)
    expect(label.length).toBeGreaterThan(4) // "15" alone is not a date
  })

  it('PageUp crosses the month and focus follows', async () => {
    const { roving, press, raf } = mountCalendar()
    press(roving()[0]!, 'PageUp')
    await raf()
    expect(roving().map((c) => c.textContent)).toEqual(['15'])
    expect(document.activeElement).toBe(roving()[0]!)
  })
})
