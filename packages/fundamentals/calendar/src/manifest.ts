import { defineManifest } from '@pyreon/manifest'
import { entry, typeEntry } from './manifest-parts'

/** Every `// =>` line in an example is executed by `src/tests/examples.test.ts` and compared with the value after the arrow. */
export default defineManifest({
  name: '@pyreon/calendar',
  title: 'Calendar',
  tagline: 'An event calendar and scheduler: event model, recurrence and time zones, month and time-grid layout',
  description:
    'The pure core of an event calendar (`@pyreon/calendar/core`, no DOM): a plain event model (a date is an all-day event, a date-time is a wall clock, floating or in the event\'s own zone, an instant is shown in the display zone; the end is exclusive), validation with `[Pyreon] calendar:` errors that name the event, recurrence and overrides through `@pyreon/schedule`, the window of each view with navigation and titles, and the two layout algorithms as pure functions with stable keys: month lanes (multi-day and all-day events in lanes per week row, cut at the week edges with continuation flags, "+N more" per day given a capacity) and time-grid column packing (overlapping events share the width, a block grows into the free columns to its right, pinned columns keep blocks still while another is dragged, a short event keeps a minimum height, an event across midnight is a block on each day). The time grid is a wall-clock grid: on the day a zone moves its clock the skipped hour is an empty row and the repeated hour is drawn over itself, and the now line follows the clock. Per-day signatures let a reactive layer skip recomputing a day that did not change.',
  category: 'universal',
  multiplatform: {
    tier: 'web-only',
    rationale: 'an event calendar is a DOM view (pointer, keyboard and layout); the pure core is plain TypeScript a native app can call itself',
  },
  features: [
    'Event model: all-day dates, floating wall clocks, events in their own zone, instants; exclusive ends; allDay(date, days) helper; validation that names the bad event',
    'Recurrence, overrides (title, moved, cancelled) and zones through @pyreon/schedule; an all-day event never moves with the zone; keys that are the same in every window',
    'View windows with navigation: month (with leading and trailing days), week and work week on any weekStart, day, days(n), agenda, year; hidden weekdays; titles through a formatter callback',
    'Month lanes: longer and earlier first, a total order so the result does not depend on input order, split at week edges, "+N more" per day',
    'Column packing: interval colouring with growth into free columns, pinned columns, minimum height, binary-search placement (200 events in one hour is not quadratic)',
    'Wall-clock time grid with explicit DST behaviour (23 and 25 hour days), dayStart and dayEnd clipping, a correct now line, per-day signatures for memoisation',
  ],
  longExample: `import { expandOccurrences, layoutDay } from '@pyreon/calendar/core'
import type { CalendarEvent } from '@pyreon/calendar/core'

const events: CalendarEvent[] = [{ id: 'design', title: 'Design review', start: '2026-11-18T14:00', end: '2026-11-18T15:00' }, { id: 'sync', title: 'Sync', start: '2026-11-18T14:30', end: '2026-11-18T15:30' }]
const occurrences = expandOccurrences(events, { start: '2026-11-16', end: '2026-11-23' }, 'Europe/Prague')

layoutDay('2026-11-18', occurrences, 'Europe/Prague').map((b) => [b.column, b.columns])   // => [[0, 2], [1, 2]]`,
  api: [
    entry('allDay', "(date: PlainDate, days?: number) => { start, end, allDay: true }", 'The start and exclusive end of an all-day event: one day by default, or `days` days. Events end exclusively, so a one-day event on the 18th ends on the 19th.', `allDay('2026-11-18')   // => { start: '2026-11-18', end: '2026-11-19', allDay: true }
allDay('2026-11-30', 3).end   // => '2026-12-03'`),
    entry('expandOccurrences', '(events, range: Interval<PlainDate>, zone: TimeZone) => EventOccurrence[]', 'The occurrences of the events that fall in a half-open window of dates in the display zone, placed in that zone and sorted by start. Single and recurring events (with overrides and cancellations through `@pyreon/schedule`), events in their own zone, floating wall clocks and instants. An all-day event never moves with the zone. A malformed event throws a `[Pyreon] expandOccurrences:` error that names it; `range` may be the whole result of `visibleRange()`; two events with one id are both listed, the second with a numbered key.', `const [o] = expandOccurrences([{ id: 'p', title: 'P', start: '2026-11-18T09:00', end: '2026-11-18T10:00', timeZone: 'Europe/Prague' }], { start: '2026-11-16', end: '2026-11-23' }, 'America/New_York')
o!.start   // => '2026-11-18T03:00'`),
    entry('visibleRange', '(view, date, options?) => { range, dates, rows }', 'The window of a view around a date: the grid of a month (with its leading and trailing days), a week from `weekStart`, a work week, a day, `days` days, an agenda, or a year. `range.end` is exclusive; hidden weekdays are left out of `dates` and `rows`.', `visibleRange('week', '2026-11-18').range   // => { start: '2026-11-16', end: '2026-11-23' }
visibleRange('workWeek', '2026-11-18').dates.length   // => 5`),
    entry('navigate', '(view, date, steps, options?) => PlainDate', 'The anchor date after moving `steps` views forward (negative: back): a month, a week, a day, `days` days, an agenda, a year.', `navigate('month', '2026-01-31', 1)   // => '2026-02-28'
navigate('week', '2026-11-18', -1)   // => '2026-11-11'`),
    entry('viewTitle', '(shown: VisibleRange, format?: TitleFormatter) => string', 'The title of a view through a formatter callback (the reactive entry passes `@pyreon/format`), so the core needs no locale. Without one it is a plain ISO form.', `viewTitle(visibleRange('month', '2026-11-18'))   // => '2026-11'
viewTitle(visibleRange('week', '2026-11-18'), (i) => i.first + ' / ' + i.last)   // => '2026-11-16 / 2026-11-22'`),
    entry('plainTitle', '(info: TitleInfo) => string', 'The default title formatter: `2026-11`, `2026-11-16 to 2026-11-22`, `2026`.', `plainTitle({ view: 'year', date: '2026-11-18', first: '2026-01-01', last: '2026-12-31' })   // => '2026'`, { kind: 'function' }),
    entry('layoutRow', '(occurrences, dates, capacity?) => WeekLayout', 'Events as segments in lanes across one row of days (a week of a month, or the all-day row of a time grid), cut at the row\'s edges with continuation flags. Longer events first, then all-day before timed, then earlier, then by key: a total order, so the lanes do not depend on the order of the input. With a `capacity`, lanes beyond it are dropped and counted per day in `more`.', `const row = layoutRow(expandOccurrences([{ id: 'c', title: 'C', start: '2026-11-14', end: '2026-11-18' }], { start: '2026-11-09', end: '2026-11-30' }, 'UTC'), ['2026-11-16', '2026-11-17', '2026-11-18'])
row.lanes[0]![0]!.continuesBefore   // => true`),
    entry('layoutMonth', '(occurrences, rows, capacity?) => WeekLayout[]', 'The rows of a month grid laid out; each occurrence is in every row it touches.', `layoutMonth([], visibleRange('month', '2026-11-18').rows).length   // => 6`),
    entry('daySpan', '(occurrence) => { first, last }', 'The first and last date (inclusive) an occurrence touches. An end exactly at midnight does not touch that day.', `daySpan(expandOccurrences([{ id: 'a', title: 'A', start: '2026-11-16T22:00', end: '2026-11-17T00:00' }], { start: '2026-11-16', end: '2026-11-18' }, 'UTC')[0]!)   // => { first: '2026-11-16', last: '2026-11-16' }`),
    entry('packColumns', '(blocks: { key, start, end }[], options?: { minMinutes?, pinned? }) => { key, column, columns, span }[]', 'Overlapping blocks share the width of a day column: groups of overlapping blocks get columns by interval colouring, and each block grows to the right through the columns that are free for its whole length. The result depends only on the blocks, not on their order; `pinned` keeps chosen blocks in their column; each placement is a binary search.', `packColumns([{ key: 'a', start: 540, end: 600 }, { key: 'b', start: 570, end: 630 }]).map((p) => [p.key, p.column, p.columns])   // => [['a', 0, 2], ['b', 1, 2]]`),
    entry('layoutDay', '(date, occurrences, zone, options?) => TimedBlock[]', 'The blocks of one day of a time grid: timed occurrences that touch the day, cut at its edges (an event across midnight is a block on each day), clipped to `dayStart` and `dayEnd`, packed into columns. Positions are fractions of the visible day. A wall-clock grid: on the day a zone skips an hour that row is empty and an event across it is taller than it lasts; on the day a zone repeats an hour the second pass is drawn over the first.', `const list = expandOccurrences([{ id: 'a', title: 'A', start: '2026-11-18T09:00', end: '2026-11-18T10:30' }], { start: '2026-11-18', end: '2026-11-19' }, 'UTC')
layoutDay('2026-11-18', list, 'UTC')[0]!.height   // => 0.0625`),
    entry('layoutTimeGrid', '(occurrences, dates, zone, options?) => { allDay, days, slots }', 'A whole time grid: the all-day row (lanes across the days), a column of blocks per day with a signature, and the slot times.', `layoutTimeGrid([], ['2026-11-18'], 'UTC').slots.length   // => 48`),
    entry('daySignature', '(date, occurrences, zone) => string', 'A string that changes exactly when the blocks of a day would: use it to skip recomputing a day whose occurrences did not change.', `daySignature('2026-11-18', [], 'UTC')   // => ''`),
    entry('nowOffset', '(date, now, zone, options?) => number | null', 'Where the "now" line is on a day, as a fraction of the visible day; `null` when `now` is not on that day or is outside the visible hours. It follows the wall clock, also on a day with a skipped or repeated hour.', `nowOffset('2026-11-18', Date.UTC(2026, 10, 18, 12), 'UTC')   // => 0.5
nowOffset('2026-11-19', Date.UTC(2026, 10, 18, 12), 'UTC')   // => null`),
    entry('dayBounds', '(date, zone) => { startMs, endMs, elapsedMinutes }', 'The instants a calendar day starts and ends at in a zone. On the day a zone moves its clock it is 23 or 25 hours.', `dayBounds('2026-03-29', 'Europe/Prague').elapsedMinutes   // => 1380`),
    entry('wallMinute', '(ms, zone) => number', 'The wall-clock minute from midnight an instant shows at in a zone.', `wallMinute(Date.UTC(2026, 10, 18, 15, 30), 'UTC')   // => 930`),
    entry('slotTimes', '(options?) => PlainTime[]', 'The start times of the rows of the grid between `dayStart` and `dayEnd`, every `slot` (30 minutes by default).', `slotTimes({ dayStart: '08:00', dayEnd: '10:00', slot: { minutes: 45 } })   // => ['08:00', '08:45', '09:30']`),
    entry('visibleMinutes', '(options?) => { from, to }', 'The visible window of a day in wall-clock minutes; throws when `dayEnd` is not after `dayStart`.', `visibleMinutes({ dayStart: '08:00', dayEnd: '18:00' })   // => { from: 480, to: 1080 }`),
    entry('createCalendar', '(options: CalendarOptions) => Calendar', 'The reactive calendar (it returns a `Calendar`: `view`, `setView`, `date`, `goTo`, `next`, `previous`, `today`, `range`, `dates`, `title`, `month`, `timeGrid`, `occurrences`, `cursor`, `selection`, `selectDay`, `selectSlot`, `onKeyDown`, `dispose`). `events` is a reactive source the calendar never changes; `view` and `date` are values (uncontrolled) or signals you own (controlled); the zone and the locale default to the ambient ones; `weekStart` and the weekend default to the locale\'s. It gives the `range()` and `title()` (through `@pyreon/format`, in the active locale), the `month()` and `timeGrid()` view models whose layouts are memoised per week and per day (changing one event recomputes only the days it touches), the focused `cursor()`, a `selection()` and the grid keyboard. `onRangeChange` is the place to fetch events for the visible window.', `const calendar = createCalendar({ events: () => [{ id: 'a', title: 'A', start: '2026-11-18T14:00', end: '2026-11-18T15:00' }], date: '2026-11-18', view: 'week', now: () => Date.UTC(2026, 10, 18, 12), timeZone: () => 'UTC', locale: () => 'en-GB' })
calendar.range()   // => { start: '2026-11-16', end: '2026-11-23' }
calendar.timeGrid().days[2]!.blocks()[0]!.top   // => 0.5833333333333334
calendar.timeGrid().days[2]!.nowOffset()   // => 0.5`),
    entry('gridMove', '(date, key, options?: { weekStart?, hiddenDays?, rtl? }) => PlainDate | null', 'Where a key moves the focused date of a month grid (the WAI-ARIA grid pattern): arrows by a day or a week (Left and Right swap in right-to-left text and skip hidden weekdays), Home and End to the week\'s first and last shown day, PageUp and PageDown by a month, with Shift by a year. It is pure, so a date picker\'s grid can share it.', `gridMove('2026-11-18', { key: 'ArrowDown' })   // => '2026-11-25'
gridMove('2026-11-18', { key: 'PageDown', shiftKey: true })   // => '2027-11-18'
gridMove('2026-11-18', { key: 'ArrowRight' }, { rtl: true })   // => '2026-11-17'`),
    entry('slotMove', '(cursor, key, options) => SlotCursor | null', 'Where a key moves the focused slot of a time grid: Up and Down by a slot, Left and Right by a day (swapped in right-to-left), Home and End to the first and last slot, PageUp and PageDown by a week of columns. It stays inside the grid.', `slotMove({ date: '2026-11-18', minute: 540 }, { key: 'ArrowDown' }, { from: 0, to: 1440, slot: 30, dates: ['2026-11-18'] })   // => { date: '2026-11-18', minute: 570 }`),
    entry('eventLabel', '(occurrence, locale, labels) => string', 'What a screen reader hears for an event: "Design review, Wednesday 18 November, 14:00 to 15:00"; an all-day event says so; one over several days says where it starts and ends.', `eventLabel(expandOccurrences([{ id: 'p', title: 'Public holiday', start: '2026-11-17', end: '2026-11-18' }], { start: '2026-11-16', end: '2026-11-23' }, 'UTC')[0]!, 'en-GB', DEFAULT_LABELS)   // => 'Public holiday, Tuesday 17 November, all day'`),
    entry('dayLabel', '(date, locale) => string', 'A date as it is read: "Tuesday 18 November".', `dayLabel('2026-11-18', 'en-GB')   // => 'Wednesday 18 November'`),
    entry('DEFAULT_LABELS', 'CalendarLabels', 'The words the calendar says (labels, "all day", "N more", the names of the views). Replace any of them through the `labels` prop for a translation.', `DEFAULT_LABELS.allDay   // => 'all day'`, { kind: 'constant' }),
    entry('Calendar', '(props: CalendarProps) => VNode', 'The calendar component (import `@pyreon/calendar/components`): an optional toolbar, the view the calendar is on (the month grid, or the time grid of a week, work week, day or days) and a polite live region that says where navigation went. Render slots: `renderEvent`, `renderDay`, `renderMore`; words through `labels`.', `import { Calendar } from '@pyreon/calendar/components'
import { createCalendar } from '@pyreon/calendar'
import '@pyreon/calendar/styles.css'

const calendar = createCalendar({ events: () => [] })
export const App = () => <Calendar calendar={calendar} />`, { kind: 'component' }),
    entry('MonthView', '(props: MonthViewProps) => VNode', 'The month: a WAI-ARIA grid of day cells with roving focus, the events as labelled buttons inside the cell they start in (spanning the days they last, in lanes, "+N more"), today and the selection marked.', `import { MonthView } from '@pyreon/calendar/components'
import { createCalendar } from '@pyreon/calendar'

const calendar = createCalendar({ events: () => [] })
export const Month = () => <MonthView calendar={calendar} />`, { kind: 'component' }),
    entry('TimeGridView', '(props: ViewProps) => VNode', 'The time grid of a week, work week, day or days: a WAI-ARIA grid whose rows are slots and columns are days, with the all-day row, a time gutter, events placed by the column packing, opening hours shaded and the now line.', `import { TimeGridView } from '@pyreon/calendar/components'
import { createCalendar } from '@pyreon/calendar'

const calendar = createCalendar({ events: () => [], view: 'week' })
export const Week = () => <TimeGridView calendar={calendar} />`, { kind: 'component' }),
    entry('WeekView', '(props: CalendarViewProps) => VNode', 'The time grid for a calendar on the `week` or `workWeek` view.', `import { WeekView } from '@pyreon/calendar/components'
import { createCalendar } from '@pyreon/calendar'

const calendar = createCalendar({ events: () => [], view: 'week' })
export const Week = () => <WeekView calendar={calendar} />`, { kind: 'component' }),
    entry('DayView', '(props: CalendarViewProps) => VNode', 'The time grid for a calendar on the `day` view.', `import { DayView } from '@pyreon/calendar/components'
import { createCalendar } from '@pyreon/calendar'

const calendar = createCalendar({ events: () => [], view: 'day' })
export const Day = () => <DayView calendar={calendar} />`, { kind: 'component' }),
    entry('CalendarToolbar', '(props: CalendarToolbarProps) => VNode', 'The title with Today, Previous and Next buttons and a switch of the view (buttons with `aria-pressed`).', `import { CalendarToolbar } from '@pyreon/calendar/components'
import { createCalendar } from '@pyreon/calendar'

const calendar = createCalendar({ events: () => [] })
export const Bar = () => <CalendarToolbar calendar={calendar} views={['month', 'week']} />`, { kind: 'component' }),
    typeEntry('CalendarEvent', 'interface CalendarEvent<Meta> { id; title; start; end; allDay?; timeZone?; recurrence?; overrides?; resourceId?; editable?; color?; meta? }', 'An event as plain JSON-safe data. A date start and end make it all-day; a date-time is a wall clock (in `timeZone`, or floating in the display zone); a number is an instant. The end is exclusive.', `const event: CalendarEvent = { id: 'a', title: 'A', start: '2026-11-18', end: '2026-11-19' }`),
    typeEntry('EventOccurrence', 'interface EventOccurrence<Meta> { key; event; occurrence; title; allDay; start; end; startMs; endMs; recurring }', 'One occurrence of an event placed in the display zone; the key (`"<id>:<occurrence>"`) is the same in every window.', `const none: EventOccurrence[] = []`),
    typeEntry('TimedBlock', 'interface TimedBlock { key; occurrenceKey; top; height; column; columns; span; left; width; startMinute; endMinute; continuesBefore; continuesAfter }', 'A block of a time-grid column; `top`, `height`, `left` and `width` are fractions.', `const blocks: TimedBlock[] = []`),
  ],
  gotchas: [
    { label: 'The end is exclusive', note: 'A one-day all-day event on the 18th ends on the 19th (`allDay("2026-11-18")` makes the pair). A timed event that ends exactly at midnight does not appear on the next day. An all-day event whose end equals its start is treated as one day; a timed one is a moment.' },
    { label: 'Which clock a date-time is on', note: 'A date-time with the event\'s `timeZone` is that zone\'s wall clock ("9:00 in Prague", a New York viewer sees 3:00). Without one it is floating: the same wall clock in whatever zone is displayed. An instant is shown in the display zone. A date (all-day) never moves.' },
    { label: 'The time grid is a wall-clock grid', note: 'A row is the hour the clock shows. On the day a zone skips an hour the skipped row is empty and an event across it is taller than it lasts; on the day a zone repeats an hour the second pass is drawn over the same rows as the first and the two share columns when they overlap on screen. Block positions and the now line follow the clock.' },
    { label: 'Override keys', note: 'An override is keyed by the original start of the occurrence: `"2026-11-18T09:00"` (in the event\'s wall clock), or `"2026-11-18"` for an all-day event. Moving an occurrence does not change its key.' },
    { label: 'Keys', note: 'An occurrence key is `"<id>:<original start>"`, the same in every window and, for an instant event, in every zone (it uses the number). Two events with the same id are both listed and the second gets a `~2` suffix; give events unique ids.' },
    { label: 'Hidden days', note: 'A day view on a hidden weekday has no dates; a month with hidden weekdays has fewer columns and keeps the leading and trailing days of the visible weeks.' },
  ],
  since: '0.53.0',
})
