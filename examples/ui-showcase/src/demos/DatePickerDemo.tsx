import { signal } from '@pyreon/reactivity'
import { DatePicker, Calendar, Button } from '@pyreon/ui-components'
import type { CalendarDate, CalendarState } from '@pyreon/ui-primitives'

export function DatePickerDemo() {
  const showCal1 = signal(false)
  const date1 = signal<CalendarDate | null>(null)
  const showCal2 = signal(false)
  const date2 = signal<CalendarDate | null>({ year: 2026, month: 3, day: 6 })

  function formatDate(d: CalendarDate | null): string {
    if (!d) return ''
    return `${d.year}-${String(d.month + 1).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
  }

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">DatePicker</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Input field with calendar dropdown for date selection.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Basic DatePicker</h3>
      <div style="position: relative; max-width: 280px; margin-bottom: 24px;">
        <DatePicker
          style="padding: 8px 12px; cursor: pointer;"
          onClick={() => showCal1.set(!showCal1())}
        >
          {() => date1() ? formatDate(date1()) : 'Select a date...'}
        </DatePicker>
        {() => showCal1() ? (
          <div style="position: absolute; top: 100%; left: 0; z-index: 50; margin-top: 4px;">
            <Calendar
              {...{
                value: date1(),
                onChange: (d: CalendarDate) => { date1.set(d); showCal1.set(false) },
                children: (state: CalendarState) => (
                  <div style="width: 300px; background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                      <button onClick={state.prevMonth} style="background: none; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; cursor: pointer;">&lt;</button>
                      <span style="font-weight: 600; font-size: 14px;">{state.monthLabel()}</span>
                      <button onClick={state.nextMonth} style="background: none; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; cursor: pointer;">&gt;</button>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; margin-bottom: 4px;">
                      {state.weekdays().map((wd) => (
                        <div style="font-size: 11px; color: #9ca3af; padding: 4px;">{wd}</div>
                      ))}
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center;">
                      {state.days().flat().map((day) => (
                        <button
                          onClick={() => state.select(day.date)}
                          style={`
                            padding: 6px 2px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;
                            background: ${day.isSelected ? '#3b82f6' : day.isToday ? '#eff6ff' : 'transparent'};
                            color: ${day.isSelected ? 'white' : !day.isCurrentMonth ? '#d1d5db' : day.isToday ? '#3b82f6' : '#374151'};
                            font-weight: ${day.isToday || day.isSelected ? '600' : '400'};
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
        ) : null}
        <p style="font-size: 13px; color: #6b7280; margin-top: 8px;">
          Selected: {() => formatDate(date1()) || 'None'}
        </p>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Pre-selected Date</h3>
      <div style="position: relative; max-width: 280px; margin-bottom: 24px;">
        <DatePicker
          style="padding: 8px 12px; cursor: pointer;"
          onClick={() => showCal2.set(!showCal2())}
        >
          {() => formatDate(date2())}
        </DatePicker>
        {() => showCal2() ? (
          <div style="position: absolute; top: 100%; left: 0; z-index: 50; margin-top: 4px;">
            <Calendar
              {...{
                value: date2(),
                onChange: (d: CalendarDate) => { date2.set(d); showCal2.set(false) },
                children: (state: CalendarState) => (
                  <div style="width: 300px; background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                      <button onClick={state.prevMonth} style="background: none; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; cursor: pointer;">&lt;</button>
                      <span style="font-weight: 600; font-size: 14px;">{state.monthLabel()}</span>
                      <button onClick={state.nextMonth} style="background: none; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; cursor: pointer;">&gt;</button>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; margin-bottom: 4px;">
                      {state.weekdays().map((wd) => (
                        <div style="font-size: 11px; color: #9ca3af; padding: 4px;">{wd}</div>
                      ))}
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center;">
                      {state.days().flat().map((day) => (
                        <button
                          onClick={() => state.select(day.date)}
                          style={`
                            padding: 6px 2px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;
                            background: ${day.isSelected ? '#3b82f6' : day.isToday ? '#eff6ff' : 'transparent'};
                            color: ${day.isSelected ? 'white' : !day.isCurrentMonth ? '#d1d5db' : day.isToday ? '#3b82f6' : '#374151'};
                            font-weight: ${day.isToday || day.isSelected ? '600' : '400'};
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
        ) : null}
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; max-width: 280px; margin-bottom: 24px;">
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Small</p>
          <DatePicker {...{ size: 'sm' } as any} style="padding: 6px 10px;">2026-04-06</DatePicker>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Medium</p>
          <DatePicker {...{ size: 'md' } as any} style="padding: 8px 12px;">2026-04-06</DatePicker>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Large</p>
          <DatePicker {...{ size: 'lg' } as any} style="padding: 10px 16px;">2026-04-06</DatePicker>
        </div>
      </div>
    </div>
  )
}
