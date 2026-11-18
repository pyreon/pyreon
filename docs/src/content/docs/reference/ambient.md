---
title: "@pyreon/ambient — API Reference"
description: "The ambient values every formatted thing depends on: locale, time zone and a shared clock with self-updating tickers"
---

> **Generated** from `ambient`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [ambient](/docs/ambient).

The values that formatting, dates and translations all read but none of them owns: the active locale, the active time zone and the clock. Each has an app default (`setLocale`, `setTimeZone`, `setClock`), a subtree scope that is request-scoped on a server (`provideLocale`, `provideTimeZone`, `provideClock`), and a reactive read. `useNow` is the reactive clock: one shared ticker per granularity, aligned to the wall-clock boundary (local hour and midnight in the active zone, exact on 23- and 25-hour days), refcounted, paused while the page is hidden, and never created on a server or at import. A server-to-client hand-over (`clockScript`) makes the first client render read the instant the server rendered at, so relative times hydrate without a mismatch. Most apps reach it through `@pyreon/format`, `@pyreon/time`, `@pyreon/i18n` or `@pyreon/zero`; the non-reactive story is to pass options explicitly to those packages' core entries.

> **Peer dependencies:** `@pyreon/core`, `@pyreon/reactivity` — install alongside this package.

## Multiplatform

**Tier:** Web-only — the browser package; the native story is stated below

not lowered by PMTC: the package is context plus timers on the web runtime (`document.hidden`, `setTimeout`, the owner-based context); native apps carry their own locale, zone and clock through the host runtime

See [Multiplatform](/docs/multiplatform) for the capability matrix and [Multiplatform libraries](/docs/multiplatform-libraries) for every package's tier.

## Features

- locale(), timeZone(), now(): reactive reads of the ambient locale, time zone and clock
- setLocale / setTimeZone / setClock: app defaults and test pins
- provideLocale / provideTimeZone / provideClock: subtree scopes, request-scoped on a server
- useNow(&#123; every &#125;): one shared ticker per granularity, aligned to the wall-clock boundary, refcounted
- Local-hour and local-midnight tickers in the active zone, exact across DST changes
- Paused while the page is hidden; caught up once on becoming visible; no timer on a server or at import
- Server-to-client clock hand-over so the first client render matches the server HTML
- Bounded: distinct custom intervals and zones past a cap get a private ticker released with its reader

## Complete example

A full, end-to-end usage of the package:

```tsx
import { provideLocale, provideTimeZone, setClock, useNow, now } from '@pyreon/ambient'

// App root: one place says which locale and zone everything below formats in.
provideLocale(() => 'cs')
provideTimeZone('Europe/Prague')

// A live clock: one shared ticker serves every reader of the same granularity.
const seconds = useNow({ every: 'second' })

// Tests: pin the clock for the whole app.
setClock(() => Date.UTC(2026, 10, 18, 12))
now()                                         // => 1795003200000
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`locale`](#locale-function-experimental) | function | The active locale as a reactive read: the nearest `provideLocale`, then the app default from `setLocale`, then… |
| [`setLocale`](#setlocale-function-experimental) | function | Set the app-level default locale (client). |
| [`provideLocale`](#providelocale-function-experimental) | function | Scope a subtree to a locale: a tag, or an accessor (`() => i18n.locale()`) that is tracked. |
| [`timeZone`](#timezone-function-experimental) | function | The active IANA time zone as a reactive read: the nearest `provideTimeZone`, then the app default from `setTimeZone`,… |
| [`setTimeZone`](#settimezone-function-experimental) | function | Set the app-level default time zone (client). |
| [`provideTimeZone`](#providetimezone-function-experimental) | function | Scope a subtree to a time zone: a name, or a tracked accessor. |
| [`activeZone`](#activezone-function-experimental) | function | The active zone as a formatter argument: `''` means "the runtime zone", so a hot path never builds a name. |
| [`now`](#now-function-experimental) | function | The current instant in epoch milliseconds: a plain read, not reactive, starting no timer. |
| [`setClock`](#setclock-function-experimental) | function | Pin the clock `now()` and every ticker read, for tests; `null` restores `Date.now()`. |
| [`provideClock`](#provideclock-function-experimental) | function | Scope a subtree (and, on a server, one request) to a start instant. |
| [`useNow`](#usenow-hook-experimental) | hook | A reactive reading of the clock: an accessor that updates on a shared ticker. |
| [`clockScript`](#clockscript-function-experimental) | function | The inline script that hands the server's instant to the client: `window.__PYREON_CLOCK__ = <epoch ms>`. |
| [`clockAttributes`](#clockattributes-function-experimental) | function | The same hand-over as an attribute, for a page that cannot emit a script (strict CSP): spread it on the `<html>` or… |
| [`releaseClock`](#releaseclock-function-experimental) | function | Hand real time back to the page after hydration: `now()` stops returning the server's instant and every ticker is… |
| [`Every`](#every-type-experimental) | type | How often `useNow` updates. |
| [`NowOptions`](#nowoptions-type-experimental) | type | Options of `useNow`. |
| [`ClockScriptOptions`](#clockscriptoptions-type-experimental) | type | Options of `clockScript`. |

## API

### `locale` `function` — **experimental**

```ts
() => string
```

The active locale as a reactive read: the nearest `provideLocale`, then the app default from `setLocale`, then `navigator.language` on the client or the runtime default on the server. Read it inside an effect, a computed or a JSX accessor and it re-runs when the locale changes.

**Example**

```tsx
setLocale('cs-cz')
locale()                                      // => 'cs-CZ'
```

**See also:** `setLocale` · `provideLocale`

---

### `setLocale` `function` — **experimental**

```ts
(tag: string) => void
```

Set the app-level default locale (client). A malformed tag throws a `[Pyreon]` error. On a server it is a no-op with a development warning, because one process serves many requests: use `provideLocale` there.

**Example**

```tsx
setLocale('de')
locale()                                      // => 'de'
```

---

### `provideLocale` `function` — **experimental**

```ts
(tag: string | (() => string)) => void
```

Scope a subtree to a locale: a tag, or an accessor (`() => i18n.locale()`) that is tracked. Call it in a component's setup. Owner-based on the client and request-scoped on a server, so two requests never see each other's locale.

**Example**

```tsx
// in a root component
provideLocale(() => 'cs')
```

**Common mistakes**

- Calling it outside a component: it then applies to the whole page for good (a development warning says so). Use `setLocale` for the app default

---

### `timeZone` `function` — **experimental**

```ts
() => string
```

The active IANA time zone as a reactive read: the nearest `provideTimeZone`, then the app default from `setTimeZone`, then the runtime's zone.

**Example**

```tsx
setTimeZone('Asia/Tokyo')
timeZone()                                    // => 'Asia/Tokyo'
```

**See also:** `setTimeZone` · `provideTimeZone`

---

### `setTimeZone` `function` — **experimental**

```ts
(zone: string) => void
```

Set the app-level default time zone (client). An unknown zone throws a `[Pyreon]` error; on a server it is a no-op with a development warning.

**Example**

```tsx
setTimeZone('Europe/Prague')
timeZone()                                    // => 'Europe/Prague'
```

---

### `provideTimeZone` `function` — **experimental**

```ts
(zone: string | (() => string)) => void
```

Scope a subtree to a time zone: a name, or a tracked accessor. Request-scoped on a server.

**Example**

```tsx
// in a root component
provideTimeZone('America/New_York')
```

---

### `activeZone` `function` — **experimental**

```ts
() => string
```

The active zone as a formatter argument: `''` means "the runtime zone", so a hot path never builds a name. Used by `@pyreon/format`; apps want `timeZone()`.

**Example**

```tsx
setTimeZone('UTC')
activeZone()                                  // => 'UTC'
```

---

### `now` `function` — **experimental**

```ts
() => number
```

The current instant in epoch milliseconds: a plain read, not reactive, starting no timer. Resolution: the nearest `provideClock`, then the pin from `setClock`, then the server's instant on a page that received one (until it is released), then `Date.now()`.

**Example**

```tsx
typeof now()                                  // => 'number'
```

**See also:** `setClock` · `useNow`

---

### `setClock` `function` — **experimental**

```ts
(source: (() => number) | null) => void
```

Pin the clock `now()` and every ticker read, for tests; `null` restores `Date.now()`. Process-wide: on a server it would pin every request, so use `provideClock` there (a development warning says so).

**Example**

```tsx
setClock(() => 1_000_000)
now()                                         // => 1000000
setClock(null)
```

---

### `provideClock` `function` — **experimental**

```ts
(instant: number | (() => number)) => void
```

Scope a subtree (and, on a server, one request) to a start instant. On a server this is the instant the page was rendered at; emit it with `clockScript()` or `clockAttributes()` so the client's first render reads the same instant. Call it in a root component's setup.

**Example**

```tsx
// in a root component, on the server
provideClock(Date.now())
```

**See also:** `clockScript` · `releaseClock`

---

### `useNow` `hook` — **experimental**

```ts
(options?: { every?: Every | (() => Every); zone?: string | (() => string) }) => () => number
```

A reactive reading of the clock: an accessor that updates on a shared ticker. `every` is `"second"`, `"minute"` (default), `"hour"`, `"day"` or a number of milliseconds; `"hour"` and `"day"` align to the local hour and midnight of `zone` (default: the active zone, tracked), and a function `every` is read reactively so a reader can move to a slower ticker as it ages. One timer serves every reader of the same granularity; each tick is scheduled from the clock to the next boundary, so a late timer does not drift; the ticker stops when its last reader goes; no timer runs while the page is hidden, and on becoming visible every reader is updated once. Call it in a component's setup: the ticker is released with the scope. Outside a scope, and on a server, it returns the plain `now` read: no subscription, no timer.

**Example**

```tsx
typeof useNow({ every: 'second' })()          // => 'number'
```

**Common mistakes**

- Calling it inside an effect that re-runs: each run takes a new reference. Call it once in setup
- Expecting it to tick on a server: nothing runs there; the HTML carries the instant of `provideClock`

**See also:** `now` · `provideClock`

---

### `clockScript` `function` — **experimental**

```ts
(options?: { instant?: number; nonce?: string }) => string
```

The inline script that hands the server's instant to the client: `window.__PYREON_CLOCK__ = <epoch ms>`. Put it in the page head, before the app script. The client reads it on its first `now()` or `useNow()`, before hydration, and releases it one macrotask later so real time takes over with one update.

**Example**

```tsx
clockScript({ instant: 1000 })                // => '<script>window.__PYREON_CLOCK__=1000</script>'
```

**See also:** `clockAttributes` · `provideClock`

---

### `clockAttributes` `function` — **experimental**

```ts
(instant?: number) => { "data-pyreon-clock": string }
```

The same hand-over as an attribute, for a page that cannot emit a script (strict CSP): spread it on the `<html>` or `<body>` element.

**Example**

```tsx
clockAttributes(1000)                         // => { 'data-pyreon-clock': '1000' }
```

---

### `releaseClock` `function` — **experimental**

```ts
() => void
```

Hand real time back to the page after hydration: `now()` stops returning the server's instant and every ticker is updated once. It runs by itself one macrotask after the first read of a hand-over; call it yourself if your hydration is not synchronous.

**Example**

```tsx
releaseClock()                                // after a custom async hydration step
```

---

### `Every` `type` — **experimental**

```ts
type Every = 'second' | 'minute' | 'hour' | 'day' | number
```

How often `useNow` updates.

**Example**

```tsx
const e: Every = 'minute'
```

---

### `NowOptions` `type` — **experimental**

```ts
interface NowOptions { every?: Every | (() => Every); zone?: string | (() => string) }
```

Options of `useNow`.

**Example**

```tsx
const o: NowOptions = { every: 'second' }
```

---

### `ClockScriptOptions` `type` — **experimental**

```ts
interface ClockScriptOptions { instant?: number; nonce?: string }
```

Options of `clockScript`.

**Example**

```tsx
const o: ClockScriptOptions = { nonce: 'abc' }
```

---

## Package-level notes

> **Server and client:** On a server nothing ticks: `useNow()` returns the plain read, which is the `provideClock` instant when one is provided and `Date.now()` otherwise. Provide the render instant per request and emit it with `clockScript()` or `clockAttributes()`; otherwise a relative time such as "2 sec ago" can differ between the server HTML and the first client render. Capturing the instant automatically at the first read of a request needs a request-scoped store in `@pyreon/runtime-server`, which does not exist yet.

> **Hydration:** The hand-over is read on the first client `now()` and released one macrotask later. Components that first read the clock later than that (lazy islands) see real time and may mismatch against server HTML rendered at the older instant; call `releaseClock()` yourself after your own async hydration if needed.

> **Tickers are bounded:** `second` and `minute` tickers are always shared. Up to 16 other tickers (custom intervals and per-zone `hour`/`day` tickers) are shared; a reader beyond that gets a private ticker that is stopped with it.

> **Peer dependencies:** `@pyreon/core` and `@pyreon/reactivity` are both required peers: the entry imports them when it loads, and every Pyreon app has them. The non-reactive story is to pass a locale, zone or instant explicitly to the core entries of `@pyreon/format` and `@pyreon/time`.
