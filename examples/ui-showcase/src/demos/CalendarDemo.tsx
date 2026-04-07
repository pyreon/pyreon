import { signal } from '@pyreon/reactivity'
import { Title } from '@pyreon/ui-components'
import { CalendarBase } from '@pyreon/ui-primitives'
import type { CalendarDate, CalendarState } from '@pyreon/ui-primitives'

export function CalendarDemo() {
  const selected = signal<CalendarDate | null>(null)

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Calendar</Title>

      <CalendarBase
        value={selected()}
        onChange={(d: CalendarDate) => selected.set(d)}
      >
        {(state: CalendarState) => (
          <div style="width: 320px; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; background: white;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <button onClick={state.prevMonth} style="background: none; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; cursor: pointer;">
                &lt;
              </button>
              <span style="font-weight: 600;">{state.monthLabel()}</span>
              <button onClick={state.nextMonth} style="background: none; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; cursor: pointer;">
                &gt;
              </button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; margin-bottom: 8px;">
              {state.weekdays().map((wd) => (
                <div style="font-size: 12px; color: #9ca3af; padding: 4px;">{wd}</div>
              ))}
            </div>
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center;">
              {() => state.days().flat().map((day) => (
                <button
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
          </div>
        )}
      </CalendarBase>
      <p style="font-size: 13px; color: #6b7280; margin-top: 8px;">
        Selected: {() => {
          const d = selected()
          return d ? `${d.year}-${(d.month + 1).toString().padStart(2, '0')}-${d.day.toString().padStart(2, '0')}` : 'None'
        }}
      </p>
    </div>
  )
}
