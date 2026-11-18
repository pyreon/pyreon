# @pyreon/ambient

The ambient values every formatted thing depends on: the **locale**, the **time zone** and the **clock**, with self-updating tickers.

> **Experimental.** The locale and time zone behaviour is what `@pyreon/format` shipped; the clock is new.

Most apps reach it through `@pyreon/format`, `@pyreon/time`, `@pyreon/i18n` or `@pyreon/zero`. You use it directly to set app defaults, scope a subtree or a server request, pin the clock in tests, and read the clock reactively.

## Install

```bash
bun add @pyreon/ambient @pyreon/core @pyreon/reactivity
```

## Quick start

```ts
import { locale, setLocale, setTimeZone, setClock, now, useNow, provideClock, clockScript } from '@pyreon/ambient'

setLocale('cs-cz')
locale() // 'cs-CZ'
setTimeZone('Europe/Prague')

setClock(() => Date.UTC(2026, 10, 18, 12)) // pin the clock for the whole app (tests)
now() // 1795003200000
setClock(null)

// In a component's setup: one shared, aligned ticker serves every reader of a granularity.
const seconds = useNow({ every: 'second' })
```

| Area | Functions |
| --- | --- |
| Locale | `locale`, `setLocale`, `provideLocale` |
| Time zone | `timeZone`, `setTimeZone`, `provideTimeZone` |
| Clock | `now`, `setClock`, `provideClock`, `useNow` |
| Server hand-over | `clockScript`, `clockAttributes`, `releaseClock` |

Tickers: one per granularity, aligned to the wall-clock boundary (local hour and midnight in the active zone, exact on 23- and 25-hour days), refcounted, paused while the page is hidden, never created on a server or at import. On a server, `provideClock(instant)` plus `clockScript()` make the client's first render read the instant the server rendered at, so relative times hydrate without a mismatch.

Full guide: [docs/ambient](https://pyreon.dev/docs/ambient).
