/** Value-last forms: configure first, apply to the value last, so they compose in `pipe`. */
import { addBusinessDays as coreAddBusinessDays, addBusinessTime as coreAddBusinessTime, businessDaysBetween as coreBusinessDaysBetween, isBusinessDay as coreIsBusinessDay, isOpen as coreIsOpen, nextBusinessDay as coreNextBusinessDay, nextClosing as coreNextClosing, nextOpening as coreNextOpening, openingWindows as coreOpeningWindows, previousBusinessDay as corePreviousBusinessDay } from './business'
import { describeRule as coreDescribeRule, type RuleMessages } from './describe'
import { expandEvents as coreExpandEvents, type CalendarEvent, type EventInstance } from './events'
import { intersection as coreIntersection, overlaps as coreOverlaps, subtractIntervals as coreSubtractIntervals } from './intervals'
import { nextOccurrence as coreNextOccurrence, occurrencesBetween as coreOccurrencesBetween, occursOn as coreOccursOn, previousOccurrence as corePreviousOccurrence } from './recurrence'
import type { BusinessCalendar, Duration, Interval, PlainDate, PlainDateTime, PlainValue, Recurrence } from './types'

export type { BusinessCalendar, CalendarEvent, EventInstance, Interval, PlainValue, Recurrence }

/**
 * `occurrencesBetween` with the rule last.
 *
 * @example occurrencesBetween('2026-11-02', '2026-11-16')({ every: 'week', start: '2026-11-02' }) // => ['2026-11-02', '2026-11-09', '2026-11-16']
 */
export const occurrencesBetween = (from: PlainValue, to: PlainValue) => (rule: Recurrence): PlainValue[] => coreOccurrencesBetween(rule, from, to)

/**
 * `nextOccurrence` with the rule last.
 *
 * @example nextOccurrence('2026-11-18')({ every: 'week', start: '2026-11-02' }) // => '2026-11-23'
 */
export const nextOccurrence = (after: PlainValue) => (rule: Recurrence): PlainValue | null => coreNextOccurrence(rule, after)

/**
 * `previousOccurrence` with the rule last.
 *
 * @example previousOccurrence('2026-11-18')({ every: 'week', start: '2026-11-02' }) // => '2026-11-16'
 */
export const previousOccurrence = (before: PlainValue) => (rule: Recurrence): PlainValue | null => corePreviousOccurrence(rule, before)

/**
 * `occursOn` with the rule last.
 *
 * @example occursOn('2026-11-09')({ every: 'week', start: '2026-11-02' }) // => true
 */
export const occursOn = (date: PlainDate) => (rule: Recurrence): boolean => coreOccursOn(rule, date)

/**
 * `describeRule` with the rule last.
 *
 * @example describeRule()({ every: 'day', start: '2026-11-18' }) // => 'Every day'
 */
export const describeRule = (options?: { locale?: string; messages?: Partial<RuleMessages> }) => (rule: Recurrence): string => coreDescribeRule(rule, options)

/**
 * `isBusinessDay` with the date last.
 *
 * @example isBusinessDay({})('2026-11-21') // => false
 */
export const isBusinessDay = (calendar: BusinessCalendar) => (date: PlainDate | PlainDateTime): boolean => coreIsBusinessDay(date, calendar)

/**
 * `addBusinessDays` with the date last.
 *
 * @example addBusinessDays(2, {})('2026-11-20') // => '2026-11-24'
 */
export const addBusinessDays = (n: number, calendar: BusinessCalendar) => (date: PlainDate): PlainDate => coreAddBusinessDays(date, n, calendar)

/**
 * `businessDaysBetween` with the first date last.
 *
 * @example businessDaysBetween('2026-11-23', {})('2026-11-16') // => 5
 */
export const businessDaysBetween = (b: PlainDate, calendar: BusinessCalendar) => (a: PlainDate): number => coreBusinessDaysBetween(a, b, calendar)

/**
 * `nextBusinessDay` with the date last.
 *
 * @example nextBusinessDay({})('2026-11-20') // => '2026-11-23'
 */
export const nextBusinessDay = (calendar: BusinessCalendar) => (date: PlainDate): PlainDate => coreNextBusinessDay(date, calendar)

/**
 * `previousBusinessDay` with the date last.
 *
 * @example previousBusinessDay({})('2026-11-23') // => '2026-11-20'
 */
export const previousBusinessDay = (calendar: BusinessCalendar) => (date: PlainDate): PlainDate => corePreviousBusinessDay(date, calendar)

/**
 * `addBusinessTime` with the start last.
 *
 * @example addBusinessTime({ hours: 1 }, { hours: { 3: [{ from: '09:00', to: '17:00' }] } })('2026-11-18T09:00') // => '2026-11-18T10:00'
 */
export const addBusinessTime = (duration: Duration, calendar: BusinessCalendar) => (start: PlainDateTime): PlainDateTime => coreAddBusinessTime(start, duration, calendar)

/**
 * `isOpen` with the moment last.
 *
 * @example isOpen({ hours: { 3: [{ from: '09:00', to: '17:00' }] } })('2026-11-18T10:00') // => true
 */
export const isOpen = (calendar: BusinessCalendar) => (at: PlainDateTime): boolean => coreIsOpen(at, calendar)

/**
 * `nextOpening` with the moment last.
 *
 * @example nextOpening({ hours: { 4: [{ from: '09:00', to: '17:00' }] } })('2026-11-18T10:00') // => '2026-11-19T09:00'
 */
export const nextOpening = (calendar: BusinessCalendar) => (at: PlainDateTime): PlainDateTime | null => coreNextOpening(at, calendar)

/**
 * `openingWindows` with the date last.
 *
 * @example openingWindows({ hours: { 3: [{ from: '09:00', to: '17:00' }] } })('2026-11-18') // => [{ start: '2026-11-18T09:00', end: '2026-11-18T17:00' }]
 */
export const openingWindows = (calendar: BusinessCalendar) => (date: PlainDate): Interval[] => coreOpeningWindows(date, calendar)

/**
 * `nextClosing` with the moment last.
 *
 * @example nextClosing({ hours: { 3: [{ from: '09:00', to: '17:00' }] } })('2026-11-18T10:00') // => '2026-11-18T17:00'
 */
export const nextClosing = (calendar: BusinessCalendar) => (at: PlainDateTime): PlainDateTime | null => coreNextClosing(at, calendar)

/**
 * `overlaps` with the first interval last.
 *
 * @example overlaps({ start: '2026-11-18T09:30', end: '2026-11-18T11:00' })({ start: '2026-11-18T09:00', end: '2026-11-18T10:00' }) // => true
 */
export const overlaps: {
  (b: Interval<number>): (a: Interval<number>) => boolean
  (b: Interval): (a: Interval) => boolean
} = ((b: Interval<number>) => (a: Interval<number>): boolean => coreOverlaps(a, b)) as never

/**
 * `intersection` with the first interval last.
 *
 * @example intersection({ start: '2026-11-18T09:30', end: '2026-11-18T11:00' })({ start: '2026-11-18T09:00', end: '2026-11-18T10:00' }) // => { start: '2026-11-18T09:30', end: '2026-11-18T10:00' }
 */
export const intersection: {
  (b: Interval<number>): (a: Interval<number>) => Interval<number> | null
  (b: Interval): (a: Interval) => Interval | null
} = ((b: Interval<number>) => (a: Interval<number>): Interval<number> | null => coreIntersection(a, b)) as never

/**
 * `subtractIntervals` with the intervals to take from last.
 *
 * @example subtractIntervals([{ start: '2026-11-18T12:00', end: '2026-11-18T13:00' }])([{ start: '2026-11-18T09:00', end: '2026-11-18T14:00' }]) // => [{ start: '2026-11-18T09:00', end: '2026-11-18T12:00' }, { start: '2026-11-18T13:00', end: '2026-11-18T14:00' }]
 */
export const subtractIntervals: {
  (busy: readonly Interval<number>[]): (from: readonly Interval<number>[]) => Interval<number>[]
  (busy: readonly Interval[]): (from: readonly Interval[]) => Interval[]
} = ((busy: readonly Interval<number>[]) => (from: readonly Interval<number>[]): Interval<number>[] => coreSubtractIntervals(from, busy)) as never

/**
 * `expandEvents` with the events last.
 *
 * @example expandEvents({ start: '2026-11-18T00:00', end: '2026-11-19T00:00' })([{ id: 'a', start: '2026-11-18T09:00', end: '2026-11-18T10:00' }]).map((i) => i.start) // => ['2026-11-18T09:00']
 */
export const expandEvents = (range: Interval<PlainValue>) => <T extends PlainValue>(events: readonly CalendarEvent<T>[]): EventInstance<T>[] => coreExpandEvents(events, range as Interval<T>)
