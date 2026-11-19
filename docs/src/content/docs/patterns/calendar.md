---
title: "Event calendar"
summary: "Keep events as plain data with exclusive ends and zones, let the calendar expand and lay them out, key rows by occurrence, and fetch the visible window. Never position events with pixels you compute from a Date in your own component."
seeAlso: [schedule, dates-and-times]
---

## The pattern

Events are plain data: a date for an all-day event (the end is the next day), a wall clock with its own `timeZone` for "9:00 in Prague", an instant otherwise. `createCalendar` owns the view, the anchor date, the visible window, the selection and the keyboard; the month and the time grid are view models whose layouts are recomputed per week and per day. You fetch the window it tells you about.

```tsx
import { createCalendar } from '@pyreon/calendar'
import { Calendar } from '@pyreon/calendar/components'

const calendar = createCalendar({
  events: () => events(),
  onRangeChange: (range) => load(range), // the visible window, end exclusive
  onSelect: (range) => openNewEventDialog(range),
})

export const App = () => <Calendar calendar={calendar} />
```

## Why

Whether two events overlap, where a block sits, which day an event across midnight belongs to and what a recurring event does on the day the clocks change are the parts that go wrong when they are written per component. The package computes them once, as pure functions with stable keys, and the views redraw only the days that changed. Events are never mutated; the app owns them. The grid is a WAI-ARIA grid with one tab stop, so the keyboard works the same in every view.

## Editing

Set `editable` and decide changes in one place: `onEventChange(change)` receives the proposed `start`, `end`, `allDay` (and `resourceId` in the timeline); return `false`, throw or reject to refuse it and the event goes back. The event is shown at its new place while you answer. For a recurring event `chooseScope` returns `'this' | 'following' | 'all'` and `applyEventChange(event, change, zone)` returns the plain data to store (an override, a shifted series, or the series ended plus a new one). Update your events before you resolve.

```tsx
const calendar = createCalendar({
  events: () => events(),
  editable: true,
  onEventChange: async (change) => {
    if (!(await save(change))) return false
    events.set(replace(events(), change))
  },
})
```

Do not write your own mousemove handlers, mutate the events array on drop, or roll back by hand: the calendar owns the pointer, the keyboard, the optimistic display and the rollback.

## Anti-pattern

```tsx
// BROKEN: pixels from a Date, the end included, the viewer's zone, the whole list re-rendered
const top = (e: { start: Date }) => (e.start.getHours() * 60 + e.start.getMinutes()) * 0.8
const AllEvents = () => <>{events().map((e) => <div style={{ top: `${top(e)}px` }}>{e.title}</div>)}</> // overlapping events cover each other, a 23-hour day is wrong, an event across midnight is lost
```

```tsx
// Correct: let the calendar place events, and give them a zone
const calendar = createCalendar({ events: () => [{ id: 'a', title: 'Review', start: '2026-11-18T09:00', end: '2026-11-18T10:00', timeZone: 'Europe/Prague' }] })
```

Also: moving events with your own pointer handlers, mutating the events array on drop and undoing it by hand when the server refuses (use `onEventChange` and `false`), editing a recurring series by changing its first event (use `chooseScope` and `applyEventChange`), an all-day event whose end is the same day (the end is exclusive: use `allDay(date)`), keying rows by array index (use the occurrence key, which survives every window), and fetching all events instead of the window `onRangeChange` reports.

## Related

- `@pyreon/calendar` for the functions, and its docs page for the model, the views, the keyboard and the DST behaviour of the time grid.
- `@pyreon/schedule` for the recurrence rules and overrides that events use.
- Anti-pattern: "Positioning calendar events by hand, an all-day event that ends on its own day, rows keyed by index".
