---
title: Ambient values
description: The ambient values every formatted thing depends on for Pyreon — locale, time zone and a shared clock with self-updating tickers
---

<PackageBadge name="@pyreon/ambient" href="/docs/ambient" />

`@pyreon/ambient` holds the three values that formatting, dates and translations all read but none of them owns: the **active locale**, the **active time zone** and the **clock**. Most apps never import it directly: `@pyreon/format`, `@pyreon/time`, `@pyreon/i18n` and `@pyreon/zero` read it for you. You reach for it to set the app-wide defaults, to scope a subtree or a server request, to pin the clock in tests, and to read the clock reactively with `useNow`.

> **Experimental.** The locale and time zone behaviour is the behaviour `@pyreon/format` shipped, moved here so it can be shared; the clock is new.

## Installation

:::code-group

```bash [npm]
npm install @pyreon/ambient
```

```bash [bun]
bun add @pyreon/ambient
```

```bash [pnpm]
pnpm add @pyreon/ambient
```

```bash [yarn]
yarn add @pyreon/ambient
```

:::

Peer dependencies: `@pyreon/reactivity`, and `@pyreon/core` for the `provide*` functions (every Pyreon app has both). There is no non-reactive entry: the non-reactive story is to pass a locale, zone or instant explicitly to the core entries of `@pyreon/format` and `@pyreon/time`.

## Locale and time zone

Resolution order, for both: the nearest `provide*` in the component tree, then the app default from `set*`, then the runtime's (`navigator.language` in the browser, the runtime default on a server). Every read is reactive, so a format in JSX or an effect updates when the value changes.

```ts
// @check
import { locale, setLocale, setTimeZone, timeZone } from '@pyreon/ambient'

setLocale('cs-cz')
locale() // 'cs-CZ': tags are canonicalised, and a malformed tag throws a [Pyreon] error that says how to fix it
setTimeZone('Europe/Prague')
timeZone() // 'Europe/Prague'
```

`provideLocale` and `provideTimeZone` scope a subtree (owner-based on the client) or, on a server, one request. They take a value or an accessor, which is tracked: this is the seam `@pyreon/i18n` calls with `provideLocale(() => i18n.locale())`.

```tsx
import { provideLocale, provideTimeZone } from '@pyreon/ambient'

function Root(props: { children?: unknown }) {
  provideLocale(() => i18n.locale())
  provideTimeZone('Europe/Prague')

  return props.children
}
```

On a server `setLocale` and `setTimeZone` do nothing and warn in development: one process serves many requests, so a global would leak one request's locale into another. Use `provide*`, which is request-scoped (tested with interleaved renders).

## The clock

`now()` is a plain read of the clock in epoch milliseconds: no subscription, no timer. It resolves, in order: the nearest `provideClock`, the pin from `setClock`, the server's instant on a page that received one (see the hand-over below), then `Date.now()`.

```ts
// @check
import { now, setClock } from '@pyreon/ambient'

setClock(() => Date.UTC(2026, 10, 18, 12)) // pin the clock for the whole app: tests, previews, screenshots
now() // 1795003200000
setClock(null) // back to Date.now()
```

`useNow` is the reactive clock. It returns an accessor that updates on a shared ticker:

```tsx
import { useNow } from '@pyreon/ambient'

function Clock() {
  const seconds = useNow({ every: 'second' })

  return <time>{() => new Date(seconds()).toLocaleTimeString()}</time>
}
```

`every` is `'second'`, `'minute'` (the default), `'hour'`, `'day'` or a number of milliseconds. The tickers follow these rules, each with a test:

- **One ticker per granularity.** A thousand `useNow({ every: 'second' })` readers are one timer, created when the first reader appears, never at import.
- **Aligned to the wall clock.** A second ticker fires on the full second, a minute ticker on the full minute. `'hour'` and `'day'` align to the local hour and the local midnight of the zone (`zone` option, default the active zone, tracked), exact on 23- and 25-hour days and in 30- and 45-minute zones.
- **No drift.** Each tick is scheduled from the clock to the next boundary, not by adding an interval to the last one, so a late timer does not push every later tick back. A timer that wakes a few milliseconds early waits out the remainder.
- **Refcounted.** The ticker stops, and is dropped, when its last reader is released with its component. Outside a component, `useNow` returns the plain `now` read: no subscription and no timer that nothing stops.
- **Paused while hidden.** No timer runs while `document.hidden`; when the page becomes visible every reader is updated once (a missed tick is recomputed, not replayed).
- **Never on a server.** `useNow()` there returns the plain read, even inside a reactive scope.
- **Bounded.** `second` and `minute` are always shared; up to 16 other tickers (custom intervals, per-zone `hour` and `day`) are shared; a reader beyond that gets a private ticker that is stopped with it.

A function `every` is read reactively (and again after every update of the ticker the reader holds), so a reader can move to a slower ticker as its subject ages: this is how `useRelative` in `@pyreon/time` avoids holding a per-second timer for an old timestamp.

### One update at an exact instant

A shared ticker fires on the wall-clock boundary, so a label that must change when ITS OWN subject crosses a mark (a comment that turns one minute old at 12:03:41, not at the next wall minute) would be up to a minute late. A function `every` may therefore return `{ at: instant }`: one update at exactly that instant, after which the function is read again for the next one.

```tsx
const label = useNow({ every: () => ({ at: nextChangeOf(target) }) })
```

Readers that each ask for their own instant do not each get a timer: they are kept in a sorted list served by **one** timer, so 200 labels with 200 different instants cost one timer (and the list entry is dropped when a reader fires or goes away). `{ at: Infinity }` never updates and starts nothing; an instant already past is clamped to the next millisecond, so a function that keeps returning a past instant is read again each millisecond rather than looping. The same rules apply as for tickers: nothing on a server, nothing while hidden (one update on becoming visible), the timer is stopped when the last reader goes. `@pyreon/format`'s `useRelativeTime` is built on this.

## Server rendering: the clock hand-over

Text such as "2 sec ago" is computed from the clock, so the server's HTML and the client's first render must read the same instant or hydration reports a mismatch. On the server, provide the instant the page renders at and emit it with the page:

```tsx
import { clockScript, provideClock } from '@pyreon/ambient'

// In the root component, on the server: one instant for the whole render.
provideClock(requestStartedAt)

// In the HTML head, before the app script (or use clockAttributes(): spread it on <html> under a strict CSP):
const head = clockScript() // '<script>window.__PYREON_CLOCK__=1795003200000</script>'
```

On the client, the first `now()` or `useNow()` reads that instant before hydration, so the first render matches the server HTML. One macrotask later the hand-over is released: `now()` returns real time again and every ticker updates once. A page that never received a hand-over is unaffected.

Today `provideClock` and the script are wired by the app. Automating them in `@pyreon/zero` is a follow-up: the framework would capture the request's start instant and emit the script itself.

## Testing

Pin the clock with `setClock` and reset between tests with the test hooks:

```ts
import { _resetClockState, _resetLocaleState } from '@pyreon/ambient/testing'

afterEach(() => {
  _resetClockState() // drops tickers, the pin and any hand-over
  _resetLocaleState()
})
```

Fake timers work: tickers use `setTimeout` and read `Date.now()` through `now()`, so `vi.useFakeTimers({ now })` and `vi.advanceTimersByTime` drive them. A helper for this in `@pyreon/testing` is planned.

## API reference

The complete, generated reference is on the [@pyreon/ambient API reference](/docs/reference/ambient) page.
