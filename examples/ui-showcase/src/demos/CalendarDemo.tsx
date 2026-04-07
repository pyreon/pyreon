import { signal } from '@pyreon/reactivity'
import { CalendarBase } from '@pyreon/ui-primitives'
import type { CalendarDate, CalendarState } from '@pyreon/ui-primitives'

export function CalendarDemo() {
  const selectedDate = signal<CalendarDate | null>(null)
  const selectedDate2 = signal<CalendarDate | null>({ year: 2026, month: 3, day: 6 })

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Calendar</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Date calendar with month navigation, day selection, and locale support.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic Calendar</h3>
      <div style="margin-bottom: 24px;">
        <CalendarBase
          {...{
            value: selectedDate(),
            onChange: (d: CalendarDate) => selectedDate.set(d),
            children: (state: CalendarState) => (
              <div style="width: 320px; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                  <button
                    onClick={state.prevMonth}
                    style="background: none; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; cursor: pointer;"
                  >
                    &lt;
                  </button>
                  <span style="font-weight: 600;">{state.monthLabel()}</span>
                  <button
                    onClick={state.nextMonth}
                    style="background: none; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; cursor: pointer;"
                  >
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
                      disabled={day.isDisabled}
                      style={() => `
                        padding: 8px 4px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;
                        background: ${state.isSelected(day.date) ? '#3b82f6' : state.isToday(day.date) ? '#eff6ff' : 'transparent'};
                        color: ${state.isSelected(day.date) ? 'white' : !day.isCurrentMonth ? '#d1d5db' : state.isToday(day.date) ? '#3b82f6' : '#374151'};
                        font-weight: ${state.isToday(day.date) || state.isSelected(day.date) ? '600' : '400'};
                        opacity: ${day.isDisabled ? '0.3' : '1'};
                      `}
                    >
                      {day.date.day}
                    </button>
                  ))}
                </div>
              </div>
            ),
          } as any}
        />
        <p style="font-size: 13px; color: #6b7280; margin-top: 8px;">
          Selected: {() => {
            const d = selectedDate()
            return d ? `${d.year}-${String(d.month + 1).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : 'None'
          }}
        </p>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Pre-selected Date</h3>
      <div style="margin-bottom: 24px;">
        <CalendarBase
          {...{
            value: selectedDate2(),
            onChange: (d: CalendarDate) => selectedDate2.set(d),
            children: (state: CalendarState) => (
              <div style="width: 320px; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                  <div style="display: flex; gap: 4px;">
                    <button onClick={state.prevYear} style="background: none; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 11px;">&lt;&lt;</button>
                    <button onClick={state.prevMonth} style="background: none; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; cursor: pointer;">&lt;</button>
                  </div>
                  <span style="font-weight: 600;">{state.monthLabel()}</span>
                  <div style="display: flex; gap: 4px;">
                    <button onClick={state.nextMonth} style="background: none; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; cursor: pointer;">&gt;</button>
                    <button onClick={state.nextYear} style="background: none; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 11px;">&gt;&gt;</button>
                  </div>
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
                        color: ${state.isSelected(day.date) ? 'white' : !day.isCurrentMonth ? '#d1d5db' : state.isToday(day.date) ? '#3b82f6' : '#374151'};
                        font-weight: ${state.isToday(day.date) || state.isSelected(day.date) ? '600' : '400'};
                      `}
                    >
                      {day.date.day}
                    </button>
                  ))}
                </div>
              </div>
            ),
          } as any}
        />
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">With Disabled Dates</h3>
      <div style="margin-bottom: 24px;">
        <CalendarBase
          {...{
            disabledDates: (d: CalendarDate) => d.day > 0 && (d.day % 7 === 0 || d.day % 7 === 6),
            children: (state: CalendarState) => (
              <div style="width: 320px; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                  <button onClick={state.prevMonth} style="background: none; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; cursor: pointer;">&lt;</button>
                  <span style="font-weight: 600;">{state.monthLabel()}</span>
                  <button onClick={state.nextMonth} style="background: none; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; cursor: pointer;">&gt;</button>
                </div>
                <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; margin-bottom: 8px;">
                  {state.weekdays().map((wd) => (
                    <div style="font-size: 12px; color: #9ca3af; padding: 4px;">{wd}</div>
                  ))}
                </div>
                <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center;">
                  {() => state.days().flat().map((day) => (
                    <button
                      onClick={() => !day.isDisabled && state.select(day.date)}
                      style={() => `
                        padding: 8px 4px; border: none; border-radius: 6px; cursor: ${day.isDisabled ? 'not-allowed' : 'pointer'}; font-size: 13px;
                        background: ${state.isSelected(day.date) ? '#3b82f6' : 'transparent'};
                        color: ${state.isSelected(day.date) ? 'white' : day.isDisabled ? '#d1d5db' : !day.isCurrentMonth ? '#d1d5db' : '#374151'};
                        text-decoration: ${day.isDisabled && day.isCurrentMonth ? 'line-through' : 'none'};
                      `}
                    >
                      {day.date.day}
                    </button>
                  ))}
                </div>
                <p style="font-size: 11px; color: #9ca3af; margin-top: 8px; text-align: center;">
                  Dates divisible by 6 or 7 are disabled.
                </p>
              </div>
            ),
          } as any}
        />
      </div>
    </div>
  )
}
