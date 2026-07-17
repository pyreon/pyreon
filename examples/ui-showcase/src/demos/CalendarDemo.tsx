import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { Calendar, Title } from '@pyreon/ui-components'
import type { CalendarDate, CalendarDay, CalendarState } from '@pyreon/ui-primitives'

export function CalendarDemo() {
  const selected = signal<CalendarDate | null>(null)

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Calendar</Title>

      <Calendar
        value={selected()}
        onChange={(d: CalendarDate) => selected.set(d)}
      >
        {(state: CalendarState) => (
          /*
            `rootProps()` carries the Calendar component's rocketstyle class onto
            the CONTAINER — the element the theme actually describes (a card
            wrapping header + grid). It is deliberately NOT `gridProps()`: the
            card is not the grid, and styling the grid would leave the header
            outside the card. Border/radius/padding/background now come from the
            theme; `width` stays inline (sizing is not themed).
          */
          <div {...state.rootProps()} style="width: 320px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <button onClick={state.prevMonth} style="background: none; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; cursor: pointer;">
                &lt;
              </button>
              <span style="font-weight: 600;">{state.monthLabel()}</span>
              <button onClick={state.nextMonth} style="background: none; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; cursor: pointer;">
                &gt;
              </button>
            </div>
            {/*
              A REAL WAI-ARIA date grid. This demo used to render the days as
              bare <button>s with NO getDayProps — so the grid had no
              role=grid/row/columnheader/gridcell, no roving tabindex, no
              aria-selected, and NO KEYBOARD NAVIGATION AT ALL, even though
              CalendarBase implements the entire date-grid model. A screen
              reader heard a pile of unlabelled numbers.

              Rows use a keyed <For> so arrow keys re-render the day PROPS
              (which are accessors) instead of re-creating 42 cells on every
              keystroke. `getDayProps` carries role/aria-label/aria-selected/
              tabIndex/onKeyDown/ref — the ref is what lets the primitive move
              real DOM focus by date.
            */}
            <div {...state.gridProps()} style="display: flex; flex-direction: column; gap: 2px;">
              <div {...state.rowProps} style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; margin-bottom: 4px;">
                {state.weekdays().map((wd) => (
                  <div {...state.columnHeaderProps} style="font-size: 12px; color: #9ca3af; padding: 4px;">{wd}</div>
                ))}
              </div>
              <For
                each={() => state.days()}
                by={(week: CalendarDay[]) => `${week[0]!.date.year}-${week[0]!.date.month}-${week[0]!.date.day}`}
              >
                {(week: CalendarDay[]) => (
                  <div {...state.rowProps} style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center;">
                    {week.map((day) => (
                      <button
                        {...state.getDayProps(day)}
                        onClick={() => state.select(day.date)}
                        style={() => `
                          padding: 8px 4px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;
                          background: ${state.isSelected(day.date) ? '#3b82f6' : state.isToday(day.date) ? '#eff6ff' : 'transparent'};
                          color: ${state.isSelected(day.date) ? 'white' : !day.isCurrentMonth ? '#d1d5db' : '#374151'};
                          font-weight: ${state.isToday(day.date) || state.isSelected(day.date) ? '600' : '400'};
                        `}
                      >
                        {day.date.day}
                      </button>
                    ))}
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </Calendar>
      <p style="font-size: 13px; color: #6b7280; margin-top: 8px;">
        Selected: {() => {
          const d = selected()
          return d ? `${d.year}-${(d.month + 1).toString().padStart(2, '0')}-${d.day.toString().padStart(2, '0')}` : 'None'
        }}
      </p>
    </div>
  )
}
