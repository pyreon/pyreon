import { signal } from '@pyreon/reactivity'
import { DateRangePicker, Calendar } from '@pyreon/ui-components'
import type { CalendarDate, CalendarState } from '@pyreon/ui-primitives'

export function DateRangePickerDemo() {
  const showCal = signal(false)
  const startDate = signal<CalendarDate | null>(null)
  const endDate = signal<CalendarDate | null>(null)
  const selectingEnd = signal(false)

  function formatDate(d: CalendarDate | null): string {
    if (!d) return ''
    return `${d.year}-${String(d.month + 1).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
  }

  function handleSelect(d: CalendarDate) {
    if (!selectingEnd()) {
      startDate.set(d)
      endDate.set(null)
      selectingEnd.set(true)
    } else {
      const start = startDate()
      if (start && (d.year > start.year || (d.year === start.year && (d.month > start.month || (d.month === start.month && d.day >= start.day))))) {
        endDate.set(d)
      } else {
        endDate.set(start)
        startDate.set(d)
      }
      selectingEnd.set(false)
      showCal.set(false)
    }
  }

  function isInRange(d: CalendarDate): boolean {
    const s = startDate()
    const e = endDate()
    if (!s || !e) return false
    const dateVal = d.year * 10000 + d.month * 100 + d.day
    const startVal = s.year * 10000 + s.month * 100 + s.day
    const endVal = e.year * 10000 + e.month * 100 + e.day
    return dateVal >= startVal && dateVal <= endVal
  }

  function isStart(d: CalendarDate): boolean {
    const s = startDate()
    return !!s && d.year === s.year && d.month === s.month && d.day === s.day
  }

  function isEnd(d: CalendarDate): boolean {
    const e = endDate()
    return !!e && d.year === e.year && d.month === e.month && d.day === e.day
  }

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">DateRangePicker</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Dual-click calendar for selecting a date range with start and end dates.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Range Selection</h3>
      <div style="position: relative; max-width: 320px; margin-bottom: 24px;">
        <DateRangePicker
          style="padding: 8px 12px; cursor: pointer;"
          onClick={() => showCal.set(!showCal())}
        >
          {() => {
            const s = startDate()
            const e = endDate()
            if (s && e) return `${formatDate(s)} - ${formatDate(e)}`
            if (s) return `${formatDate(s)} - Select end date`
            return 'Select date range...'
          }}
        </DateRangePicker>
        {() => showCal() ? (
          <div style="position: absolute; top: 100%; left: 0; z-index: 50; margin-top: 4px;">
            <Calendar
              {...{
                onChange: handleSelect,
                children: (state: CalendarState) => (
                  <div style="width: 320px; background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                      <button onClick={state.prevMonth} style="background: none; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; cursor: pointer;">&lt;</button>
                      <span style="font-weight: 600; font-size: 14px;">{state.monthLabel()}</span>
                      <button onClick={state.nextMonth} style="background: none; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 8px; cursor: pointer;">&gt;</button>
                    </div>
                    <p style="font-size: 12px; color: #6b7280; text-align: center; margin-bottom: 8px;">
                      {() => selectingEnd() ? 'Click to select end date' : 'Click to select start date'}
                    </p>
                    <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; margin-bottom: 4px;">
                      {state.weekdays().map((wd) => (
                        <div style="font-size: 11px; color: #9ca3af; padding: 4px;">{wd}</div>
                      ))}
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center;">
                      {state.days().flat().map((day) => {
                        const inRange = isInRange(day.date)
                        const start = isStart(day.date)
                        const end = isEnd(day.date)
                        return (
                          <button
                            onClick={() => handleSelect(day.date)}
                            style={`
                              padding: 6px 2px; border: none; border-radius: ${start ? '6px 0 0 6px' : end ? '0 6px 6px 0' : inRange ? '0' : '6px'}; cursor: pointer; font-size: 13px;
                              background: ${start || end ? '#3b82f6' : inRange ? '#dbeafe' : day.isToday ? '#eff6ff' : 'transparent'};
                              color: ${start || end ? 'white' : !day.isCurrentMonth ? '#d1d5db' : inRange ? '#1d4ed8' : '#374151'};
                              font-weight: ${start || end || day.isToday ? '600' : '400'};
                            `}
                          >
                            {day.date.day}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ),
              } as any}
            />
          </div>
        ) : null}
        <p style="font-size: 13px; color: #6b7280; margin-top: 8px;">
          Start: {() => formatDate(startDate()) || 'None'} | End: {() => formatDate(endDate()) || 'None'}
        </p>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Sizes</h3>
      <div style="display: flex; flex-direction: column; gap: 12px; max-width: 320px; margin-bottom: 24px;">
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Small</p>
          <DateRangePicker {...{ size: 'sm' } as any} style="padding: 6px 10px;">2026-04-01 - 2026-04-15</DateRangePicker>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Medium</p>
          <DateRangePicker {...{ size: 'md' } as any} style="padding: 8px 12px;">2026-04-01 - 2026-04-15</DateRangePicker>
        </div>
        <div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Large</p>
          <DateRangePicker {...{ size: 'lg' } as any} style="padding: 10px 16px;">2026-04-01 - 2026-04-15</DateRangePicker>
        </div>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Static Display</h3>
      <div style="display: inline-block; margin-bottom: 24px;">
        <DateRangePicker style="padding: 8px 12px;">
          March 15, 2026 - April 6, 2026
        </DateRangePicker>
      </div>
    </div>
  )
}
