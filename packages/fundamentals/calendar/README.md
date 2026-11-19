# @pyreon/calendar

An event calendar and scheduler for Pyreon: a pure core (`@pyreon/calendar/core`), the reactive calendar (`createCalendar`), the month, week, day, agenda, year and resource timeline views, moving, resizing and selecting with the pointer and the keyboard (optimistic, with rollback), recurring-event edits as plain data, messages that follow the locale, and a default stylesheet. Experimental: tested in Chromium only and with no screen reader.

> **Experimental.**

```bash
bun add @pyreon/calendar
```

| Entry | What |
| --- | --- |
| `@pyreon/calendar/core` | event model, recurrence and zones, view windows, month lanes, column packing; no DOM, no `@pyreon/core` |
| `@pyreon/calendar` | the core plus `createCalendar`, the labels and the grid-keyboard helpers |
| `@pyreon/calendar/components` | `<Calendar>`, `<MonthView>`, `<WeekView>`, `<DayView>`, `<CalendarToolbar>` |
| `@pyreon/calendar/styles.css` | an optional default look |

```tsx
import { createCalendar } from '@pyreon/calendar'
import { Calendar } from '@pyreon/calendar/components'
import '@pyreon/calendar/styles.css'

const calendar = createCalendar({
  events: () => events(),
  onRangeChange: (range) => load(range), // the visible window, end exclusive
  onSelect: (range) => openNewEventDialog(range),
})

export const App = () => <Calendar calendar={calendar} />
```

- **Events are plain data.** A date start and end make an all-day event (the end is exclusive: `allDay('2026-11-18')`); a date-time is a wall clock, in the event's own `timeZone` or floating in the display zone; a number is an instant. Recurrence and overrides go through `@pyreon/schedule`.
- **Fine-grained.** Layouts are pure functions with stable keys, memoised per week and per day: changing one event recomputes only the days it touches.
- **Accessible.** Month and time grid are WAI-ARIA grids with one tab stop and arrows, Home and End, PageUp and PageDown, Shift to select; events are labelled buttons; today and the selection are marked; a live region announces navigation; right to left works. Checked with `axe-core` in a real browser.
- **The time grid is a wall-clock grid.** On the day a zone skips an hour, that row is empty; on the day it repeats an hour the second pass is drawn over the first. Block positions and the now line follow the clock.
- **SSR-safe.** The views render on the server for a date, zone and locale, and hydrate without a mismatch (the now line uses the ambient clock hand-over).

Full guide: [docs/calendar](https://pyreon.dev/docs/calendar).
