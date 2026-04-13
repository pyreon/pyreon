import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { splitProps } from '@pyreon/core'
import { useControllableState } from '@pyreon/hooks'
import { computed, signal } from '@pyreon/reactivity'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CalendarDate {
  year: number
  month: number // 0-11
  day: number
}

export interface CalendarBaseProps {
  /** Selected date (controlled). */
  value?: CalendarDate | null
  /** Default selected date (uncontrolled). */
  defaultValue?: CalendarDate | null
  /** Called when a date is selected. */
  onChange?: (date: CalendarDate) => void
  /** Minimum selectable date. */
  min?: CalendarDate
  /** Maximum selectable date. */
  max?: CalendarDate
  /** Dates that are disabled (cannot be selected). */
  disabledDates?: (date: CalendarDate) => boolean
  /** Locale for day/month names. Default: 'en-US'. */
  locale?: string
  /** First day of week. 0=Sunday, 1=Monday. Default: 1. */
  firstDayOfWeek?: 0 | 1
  /** Render function — receives calendar state for custom rendering. */
  children?: (state: CalendarState) => VNodeChild
  [key: string]: unknown
}

export interface CalendarState {
  /** Current view month (0-11). */
  viewMonth: () => number
  /** Current view year. */
  viewYear: () => number
  /** Selected date. */
  selected: () => CalendarDate | null
  /** The grid of days for the current view month. */
  days: () => CalendarDay[][]
  /** Weekday header labels (localized). */
  weekdays: () => string[]
  /** Month name (localized). */
  monthLabel: () => string
  /** Navigate to previous month. */
  prevMonth: () => void
  /** Navigate to next month. */
  nextMonth: () => void
  /** Navigate to previous year. */
  prevYear: () => void
  /** Navigate to next year. */
  nextYear: () => void
  /** Set view to a specific month/year. */
  goTo: (month: number, year: number) => void
  /** Select a date. */
  select: (date: CalendarDate) => void
  /** Check if a date is selected. */
  isSelected: (date: CalendarDate) => boolean
  /** Check if a date is disabled. */
  isDisabled: (date: CalendarDate) => boolean
  /** Check if a date is today. */
  isToday: (date: CalendarDate) => boolean
  /** Check if a date is in the current view month. */
  isCurrentMonth: (date: CalendarDate) => boolean
}

export interface CalendarDay {
  date: CalendarDate
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
  isDisabled: boolean
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function dateEquals(a: CalendarDate | null | undefined, b: CalendarDate | null | undefined): boolean {
  if (!a || !b) return false
  return a.year === b.year && a.month === b.month && a.day === b.day
}

function dateBefore(a: CalendarDate, b: CalendarDate): boolean {
  if (a.year !== b.year) return a.year < b.year
  if (a.month !== b.month) return a.month < b.month
  return a.day < b.day
}

function dateAfter(a: CalendarDate, b: CalendarDate): boolean {
  return dateBefore(b, a)
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getDayOfWeek(year: number, month: number, day: number): number {
  return new Date(year, month, day).getDay()
}

function getToday(): CalendarDate {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() }
}

// ─── CalendarBase ────────────────────────────────────────────────────────────

/**
 * Headless calendar primitive — manages date grid, navigation, selection, locale.
 * Renders nothing itself — passes CalendarState to children render function.
 */
export const CalendarBase: ComponentFn<CalendarBaseProps> = (props) => {
  const [own] = splitProps(props, [
    'value', 'defaultValue', 'onChange', 'min', 'max',
    'disabledDates', 'locale', 'firstDayOfWeek', 'children',
  ])

  const locale = own.locale ?? 'en-US'
  const firstDay = own.firstDayOfWeek ?? 1

  // ─── State ─────────────────────────────────────────────────────────

  const today = getToday()
  const initial = own.defaultValue ?? own.value ?? null

  const [selected, setSelected] = useControllableState<CalendarDate | null>({
    value: () => own.value,
    defaultValue: initial,
    onChange: own.onChange as ((value: CalendarDate | null) => void) | undefined,
  })

  const _viewMonth = signal(initial?.month ?? today.month)
  const _viewYear = signal(initial?.year ?? today.year)

  // ─── Locale formatting ─────────────────────────────────────────────

  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })

  const weekdays = computed(() => {
    const labels: string[] = []
    // Start from a known Sunday (Jan 4, 1970 was a Sunday)
    for (let i = 0; i < 7; i++) {
      const dayIndex = (firstDay + i) % 7
      const date = new Date(1970, 0, 4 + dayIndex)
      labels.push(weekdayFormatter.format(date))
    }
    return labels
  })

  const monthLabel = computed(() => {
    return monthFormatter.format(new Date(_viewYear(), _viewMonth(), 1))
  })

  // ─── Day grid ──────────────────────────────────────────────────────

  const days = computed((): CalendarDay[][] => {
    const year = _viewYear()
    const month = _viewMonth()
    const daysInMonth = getDaysInMonth(year, month)
    const firstDayOfMonth = getDayOfWeek(year, month, 1)

    // How many days from previous month to show
    const startOffset = (firstDayOfMonth - firstDay + 7) % 7
    const prevMonth = month === 0 ? 11 : month - 1
    const prevYear = month === 0 ? year - 1 : year
    const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth)

    const grid: CalendarDay[][] = []
    let week: CalendarDay[] = []

    // Previous month trailing days
    for (let i = startOffset - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i
      const date: CalendarDate = { year: prevYear, month: prevMonth, day }
      week.push(makeDay(date, false, year, month))
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const date: CalendarDate = { year, month, day }
      week.push(makeDay(date, true, year, month))
      if (week.length === 7) {
        grid.push(week)
        week = []
      }
    }

    // Next month leading days
    if (week.length > 0) {
      const nextMonth = month === 11 ? 0 : month + 1
      const nextYear = month === 11 ? year + 1 : year
      let day = 1
      while (week.length < 7) {
        const date: CalendarDate = { year: nextYear, month: nextMonth, day: day++ }
        week.push(makeDay(date, false, year, month))
      }
      grid.push(week)
    }

    return grid
  })

  function makeDay(date: CalendarDate, isCurrentMonth: boolean, _viewY: number, _viewM: number): CalendarDay {
    return {
      date,
      isCurrentMonth,
      isToday: dateEquals(date, today),
      isSelected: dateEquals(date, selected()),
      isDisabled: isDateDisabled(date),
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  function isDateDisabled(date: CalendarDate): boolean {
    if (own.min && dateBefore(date, own.min)) return true
    if (own.max && dateAfter(date, own.max)) return true
    if (own.disabledDates) return own.disabledDates(date)
    return false
  }

  // ─── Actions ───────────────────────────────────────────────────────

  function select(date: CalendarDate) {
    if (isDateDisabled(date)) return
    setSelected(date)
  }

  function prevMonth() {
    if (_viewMonth() === 0) {
      _viewMonth.set(11)
      _viewYear.set(_viewYear() - 1)
    } else {
      _viewMonth.set(_viewMonth() - 1)
    }
  }

  function nextMonth() {
    if (_viewMonth() === 11) {
      _viewMonth.set(0)
      _viewYear.set(_viewYear() + 1)
    } else {
      _viewMonth.set(_viewMonth() + 1)
    }
  }

  function prevYear() { _viewYear.set(_viewYear() - 1) }
  function nextYear() { _viewYear.set(_viewYear() + 1) }

  function goTo(month: number, year: number) {
    _viewMonth.set(month)
    _viewYear.set(year)
  }

  // ─── State object ──────────────────────────────────────────────────

  const state: CalendarState = {
    viewMonth: _viewMonth,
    viewYear: _viewYear,
    selected,
    days,
    weekdays,
    monthLabel,
    prevMonth,
    nextMonth,
    prevYear,
    nextYear,
    goTo,
    select,
    isSelected: (d) => dateEquals(d, selected()),
    isDisabled: isDateDisabled,
    isToday: (d) => dateEquals(d, today),
    isCurrentMonth: (d) => d.month === _viewMonth() && d.year === _viewYear(),
  }

  // Render via children function
  if (typeof own.children === 'function') {
    return (own.children as (state: CalendarState) => VNodeChild)(state)
  }

  return null
}
