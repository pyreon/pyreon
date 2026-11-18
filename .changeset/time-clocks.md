---
"@pyreon/time": minor
---

`@pyreon/time` clocks, on `@pyreon/ambient` (a new dependency of the reactive entry; `/core` and `/fp` stay dependency-free).

- **Hooks:** `useToday` (flips at local midnight), `useCountdown`, `useElapsed` and `useRelative`, the structured relative distance `{ value, unit }` with an adaptive cadence (per second under a minute, per minute under an hour, per hour under a day, then at local midnight) on shared tickers, so many labels cost a handful of timers.
- **`relativeDistance(target, base, zone)`** in core: calendar-true from a day on, with the thresholds of `formatRelativeTo` in `@pyreon/format`.
- `now`, `today`, `isToday` and the other relative-day helpers read the ambient clock and default their zone to the active one; `setClock` is the one clock for the whole app.
