import { describe, expect, it } from 'vitest'
import { allDay, dayBounds, daySignature, daySpan, expandOccurrences, layoutDay, layoutMonth, layoutRow, layoutTimeGrid, navigate, nowOffset, packColumns, slotTimes, viewTitle, visibleMinutes, visibleRange, wallMinute } from '../core'
import type { EventOccurrence } from '../core'

const shown = visibleRange('week', '2026-11-18')
const events = [{ id: 'a', title: 'A', start: '2026-11-18T09:00', end: '2026-11-18T10:00' }] as never
const occurrences = expandOccurrences(events, shown, 'UTC')

/** Every public function, called with plausible but wrong shapes: the message must name the function and the argument, not an inner function. */
const wrong: [string, () => unknown, RegExp][] = [
  ['allDay a time', () => allDay('2026-11-18T10:00' as never), /^\[Pyreon\] allDay: date must be/],
  ['allDay an object', () => allDay({} as never), /^\[Pyreon\] allDay: date must be/],
  ['expandOccurrences events object', () => expandOccurrences({} as never, shown, 'UTC'), /^\[Pyreon\] expandOccurrences: events must be an array/],
  ['expandOccurrences the result of expandOccurrences', () => expandOccurrences(events, occurrences as never, 'UTC'), /^\[Pyreon\] expandOccurrences: range must be/],
  ['expandOccurrences swapped', () => expandOccurrences('UTC' as never, shown.range, events as never), /^\[Pyreon\] expandOccurrences: events must be/],
  ['expandOccurrences zone', () => expandOccurrences(events, shown, 'Mars/Base'), /^\[Pyreon\] expandOccurrences: zone must be/],
  ['expandOccurrences zone is a window', () => expandOccurrences(events, shown, shown.range as never), /^\[Pyreon\] expandOccurrences: zone must be/],
  ['expandOccurrences range of times', () => expandOccurrences(events, { start: '2026-11-18T09:00', end: '2026-11-19T09:00' } as never, 'UTC'), /^\[Pyreon\] expandOccurrences: range must be/],
  ['expandOccurrences range reversed', () => expandOccurrences(events, { start: '2026-11-19', end: '2026-11-18' }, 'UTC'), /^\[Pyreon\] expandOccurrences: range must be/],
  ['expandOccurrences an event that is a string', () => expandOccurrences(['a'] as never, shown, 'UTC'), /^\[Pyreon\] expandOccurrences: an event must be an object/],
  ['layoutMonth the view first', () => layoutMonth(shown as never, occurrences as never), /^\[Pyreon\] layoutMonth: occurrences must be an array/],
  ['layoutMonth occurrences as rows', () => layoutMonth(occurrences, occurrences as never), /^\[Pyreon\] layoutMonth: rows must be/],
  ['layoutMonth events not occurrences', () => layoutMonth(events, shown), /^\[Pyreon\] layoutMonth: occurrences must be an array of occurrences/],
  ['layoutMonth capacity', () => layoutMonth(occurrences, shown, 'three' as never), /^\[Pyreon\] layoutMonth: capacity must be/],
  ['layoutMonth capacity array', () => layoutMonth(occurrences, shown, [3] as never), /^\[Pyreon\] layoutMonth: /],
  ['layoutRow the zone', () => layoutRow(occurrences, 'UTC' as never), /^\[Pyreon\] layoutRow: dates must be/],
  ['layoutRow rows for dates', () => layoutRow(occurrences, [['2026-11-18']] as never), /^\[Pyreon\] layoutRow: dates must be/],
  ['layoutRow null', () => layoutRow(null as never, shown.dates), /^\[Pyreon\] layoutRow: occurrences must be/],
  ['daySpan an event', () => daySpan(events[0] as never), /^\[Pyreon\] daySpan: occurrence must be/],
  ['packColumns an object', () => packColumns({} as never), /^\[Pyreon\] packColumns: blocks must be/],
  ['packColumns occurrences', () => packColumns(occurrences as never), /^\[Pyreon\] packColumns: blocks must be/],
  ['layoutDay date as the view', () => layoutDay(shown as never, occurrences, 'UTC'), /^\[Pyreon\] layoutDay: date must be/],
  ['layoutDay swapped', () => layoutDay('2026-11-18', 'UTC' as never, occurrences as never), /^\[Pyreon\] layoutDay: occurrences must be/],
  ['layoutDay zone', () => layoutDay('2026-11-18', occurrences, 5 as never), /^\[Pyreon\] layoutDay: zone must be/],
  ['layoutDay options array', () => layoutDay('2026-11-18', occurrences, 'UTC', [] as never), /^\[Pyreon\] layoutDay: options must be/],
  ['layoutDay window', () => layoutDay('2026-11-18', occurrences, 'UTC', { dayStart: '10:00', dayEnd: '09:00' }), /^\[Pyreon\] layoutDay: dayStart and dayEnd must be/],
  ['layoutTimeGrid rows', () => layoutTimeGrid(occurrences, [shown.dates] as never, 'UTC'), /^\[Pyreon\] layoutTimeGrid: dates must be/],
  ['layoutTimeGrid range', () => layoutTimeGrid(occurrences, shown.range as never, 'UTC'), /^\[Pyreon\] layoutTimeGrid: dates must be/],
  ['nowOffset the instant as a date', () => nowOffset('2026-11-18', '2026-11-18' as never, 'UTC'), /^\[Pyreon\] nowOffset: now must be/],
  ['nowOffset a Date', () => nowOffset('2026-11-18', new Date() as never, 'UTC'), /^\[Pyreon\] nowOffset: now must be/],
  ['dayBounds a view', () => dayBounds(shown as never, 'UTC'), /^\[Pyreon\] dayBounds: date must be/],
  ['wallMinute a string', () => wallMinute('now' as never, 'UTC'), /^\[Pyreon\] wallMinute: ms must be/],
  ['slotTimes a number', () => slotTimes(30 as never), /^\[Pyreon\] slotTimes: options must be/],
  ['slotTimes slot', () => slotTimes({ slot: { minutes: 0, hours: 0 } }), /^\[Pyreon\] slotTimes: /],
  ['visibleMinutes', () => visibleMinutes({ dayStart: '08:00', dayEnd: '07:00' }), /^\[Pyreon\] visibleMinutes: dayStart and dayEnd/],
  ['daySignature', () => daySignature('2026-11-18', events as never, 'UTC'), /^\[Pyreon\] daySignature: occurrences must be/],
  ['visibleRange view', () => visibleRange('fortnight' as never, '2026-11-18'), /^\[Pyreon\] visibleRange: view must be one of/],
  ['visibleRange args swapped', () => visibleRange('2026-11-18' as never, 'week' as never), /^\[Pyreon\] visibleRange: view must be/],
  ['visibleRange date', () => visibleRange('week', new Date() as never), /^\[Pyreon\] visibleRange: date must be/],
  ['navigate steps', () => navigate('week', '2026-11-18', '1' as never), /^\[Pyreon\] navigate: steps must be/],
  ['navigate the whole view', () => navigate('week', shown as never, 1), /^\[Pyreon\] navigate: date must be/],
  ['viewTitle a range', () => viewTitle(shown.range as never), /^\[Pyreon\] viewTitle: shown must be/],
  ['viewTitle the formatter', () => viewTitle(shown, 'x' as never), /^\[Pyreon\] viewTitle: format must be/],
]

describe('every public function names itself and its argument when an argument has the wrong shape', () => {
  it.each(wrong)('%s', (_name, call, pattern) => {
    let message = ''
    try {
      call()
    } catch (error) {
      message = (error as Error).message
      expect((error as Error).constructor.name).not.toBe('')
    }
    expect(message).toMatch(pattern)
    expect(message).not.toMatch(/toInstant|row\.at|is not a function|Cannot read/)
  })

  it('what the message says is a fix: it shows what was given', () => {
    expect(() => layoutMonth(shown as never, occurrences as never)).toThrow('an object with the keys view, date, range, dates, rows')
    expect(() => expandOccurrences(events, 'week' as never, 'UTC')).toThrow('range must be a window { start, end }')
  })
})

describe('the view object composes where it is unambiguous', () => {
  const week = visibleRange('week', '2026-11-18')

  it('expandOccurrences takes the whole result of visibleRange, or its range, with the same answer', () => {
    expect(expandOccurrences(events, week, 'UTC')).toEqual(expandOccurrences(events, week.range, 'UTC'))
  })

  it('layoutMonth takes the whole result, or its rows, and a capacity as a number or { capacity }', () => {
    const month = visibleRange('month', '2026-11-18')
    const list = expandOccurrences(events, month, 'UTC') as EventOccurrence[]
    expect(layoutMonth(list, month)).toEqual(layoutMonth(list, month.rows))
    expect(layoutMonth(list, month, { capacity: 2 })).toEqual(layoutMonth(list, month.rows, 2))
  })

  it('layoutRow and layoutTimeGrid take the whole result, or its dates', () => {
    expect(layoutRow(occurrences, week)).toEqual(layoutRow(occurrences, week.dates))
    expect(layoutTimeGrid(occurrences, week, 'UTC')).toEqual(layoutTimeGrid(occurrences, week.dates, 'UTC'))
  })
})
