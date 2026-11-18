import { defineManifest } from '@pyreon/manifest'

/** Every `// =>` line in an example is executed by `src/tests/manifest-examples.test.ts`. */
export default defineManifest({
  name: '@pyreon/ambient',
  title: 'Ambient values',
  tagline: 'The ambient values every formatted thing depends on: locale, time zone and a shared clock with self-updating tickers',
  description:
    'The values that formatting, dates and translations all read but none of them owns: the active locale, the active time zone and the clock. Each has an app default (`setLocale`, `setTimeZone`, `setClock`), a subtree scope that is request-scoped on a server (`provideLocale`, `provideTimeZone`, `provideClock`), and a reactive read. `useNow` is the reactive clock: one shared ticker per granularity, aligned to the wall-clock boundary (local hour and midnight in the active zone, exact on 23- and 25-hour days), refcounted, paused while the page is hidden, and never created on a server or at import. A server-to-client hand-over (`clockScript`) makes the first client render read the instant the server rendered at, so relative times hydrate without a mismatch. Most apps reach it through `@pyreon/format`, `@pyreon/time`, `@pyreon/i18n` or `@pyreon/zero`; the non-reactive story is to pass options explicitly to those packages\' core entries.',
  category: 'universal',
  multiplatform: {
    tier: 'web-only',
    rationale:
      'not lowered by PMTC: the package is context plus timers on the web runtime (`document.hidden`, `setTimeout`, the owner-based context); native apps carry their own locale, zone and clock through the host runtime',
  },
  peerDeps: ['@pyreon/core', '@pyreon/reactivity'],
  features: [
    'locale(), timeZone(), now(): reactive reads of the ambient locale, time zone and clock',
    'setLocale / setTimeZone / setClock: app defaults and test pins',
    'provideLocale / provideTimeZone / provideClock: subtree scopes, request-scoped on a server',
    'useNow({ every }): one shared ticker per granularity, aligned to the wall-clock boundary, refcounted',
    'Local-hour and local-midnight tickers in the active zone, exact across DST changes',
    'Paused while the page is hidden; caught up once on becoming visible; no timer on a server or at import',
    'Server-to-client clock hand-over so the first client render matches the server HTML',
    'Bounded: distinct custom intervals and zones past a cap get a private ticker released with its reader',
  ],
  api: [
    {
      name: 'locale',
      kind: 'function',
      signature: '() => string',
      summary: 'The active locale as a reactive read: the nearest `provideLocale`, then the app default from `setLocale`, then `navigator.language` on the client or the runtime default on the server. Read it inside an effect, a computed or a JSX accessor and it re-runs when the locale changes.',
      example: `setLocale('cs-cz')
locale()                                      // => 'cs-CZ'`,
      seeAlso: ['setLocale', 'provideLocale'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'setLocale',
      kind: 'function',
      signature: '(tag: string) => void',
      summary: 'Set the app-level default locale (client). A malformed tag throws a `[Pyreon]` error. On a server it is a no-op with a development warning, because one process serves many requests: use `provideLocale` there.',
      example: `setLocale('de')
locale()                                      // => 'de'`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'provideLocale',
      kind: 'function',
      signature: '(tag: string | (() => string)) => void',
      summary: 'Scope a subtree to a locale: a tag, or an accessor (`() => i18n.locale()`) that is tracked. Call it in a component\'s setup. Owner-based on the client and request-scoped on a server, so two requests never see each other\'s locale.',
      example: `// in a root component
provideLocale(() => 'cs')`,
      mistakes: ['Calling it outside a component: it then applies to the whole page for good (a development warning says so). Use `setLocale` for the app default'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'timeZone',
      kind: 'function',
      signature: '() => string',
      summary: 'The active IANA time zone as a reactive read: the nearest `provideTimeZone`, then the app default from `setTimeZone`, then the runtime\'s zone.',
      example: `setTimeZone('Asia/Tokyo')
timeZone()                                    // => 'Asia/Tokyo'`,
      seeAlso: ['setTimeZone', 'provideTimeZone'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'setTimeZone',
      kind: 'function',
      signature: '(zone: string) => void',
      summary: 'Set the app-level default time zone (client). An unknown zone throws a `[Pyreon]` error; on a server it is a no-op with a development warning.',
      example: `setTimeZone('Europe/Prague')
timeZone()                                    // => 'Europe/Prague'`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'provideTimeZone',
      kind: 'function',
      signature: '(zone: string | (() => string)) => void',
      summary: 'Scope a subtree to a time zone: a name, or a tracked accessor. Request-scoped on a server.',
      example: `// in a root component
provideTimeZone('America/New_York')`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'activeZone',
      kind: 'function',
      signature: '() => string',
      summary: 'The active zone as a formatter argument: `\'\'` means "the runtime zone", so a hot path never builds a name. Used by `@pyreon/format`; apps want `timeZone()`.',
      example: `setTimeZone('UTC')
activeZone()                                  // => 'UTC'`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'now',
      kind: 'function',
      signature: '() => number',
      summary: 'The current instant in epoch milliseconds: a plain read, not reactive, starting no timer. Resolution: the nearest `provideClock`, then the pin from `setClock`, then the server\'s instant on a page that received one (until it is released), then `Date.now()`.',
      example: `typeof now()                                  // => 'number'`,
      seeAlso: ['setClock', 'useNow'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'setClock',
      kind: 'function',
      signature: '(source: (() => number) | null) => void',
      summary: 'Pin the clock `now()` and every ticker read, for tests; `null` restores `Date.now()`. Process-wide: on a server it would pin every request, so use `provideClock` there (a development warning says so).',
      example: `setClock(() => 1_000_000)
now()                                         // => 1000000
setClock(null)`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'provideClock',
      kind: 'function',
      signature: '(instant: number | (() => number)) => void',
      summary: 'Scope a subtree (and, on a server, one request) to a start instant. On a server this is the instant the page was rendered at; emit it with `clockScript()` or `clockAttributes()` so the client\'s first render reads the same instant. Call it in a root component\'s setup.',
      example: `// in a root component, on the server
provideClock(Date.now())`,
      seeAlso: ['clockScript', 'releaseClock'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'useNow',
      kind: 'hook',
      signature: '(options?: { every?: Every | (() => Every); zone?: string | (() => string) }) => () => number',
      summary:
        'A reactive reading of the clock: an accessor that updates on a shared ticker. `every` is `"second"`, `"minute"` (default), `"hour"`, `"day"` or a number of milliseconds; `"hour"` and `"day"` align to the local hour and midnight of `zone` (default: the active zone, tracked), and a function `every` is read reactively so a reader can move to a slower ticker as it ages. One timer serves every reader of the same granularity; each tick is scheduled from the clock to the next boundary, so a late timer does not drift; the ticker stops when its last reader goes; no timer runs while the page is hidden, and on becoming visible every reader is updated once. Call it in a component\'s setup: the ticker is released with the scope. Outside a scope, and on a server, it returns the plain `now` read: no subscription, no timer.',
      example: `typeof useNow({ every: 'second' })()          // => 'number'`,
      mistakes: [
        'Calling it inside an effect that re-runs: each run takes a new reference. Call it once in setup',
        'Expecting it to tick on a server: nothing runs there; the HTML carries the instant of `provideClock`',
      ],
      seeAlso: ['now', 'provideClock'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'clockScript',
      kind: 'function',
      signature: '(options?: { instant?: number; nonce?: string }) => string',
      summary: 'The inline script that hands the server\'s instant to the client: `window.__PYREON_CLOCK__ = <epoch ms>`. Put it in the page head, before the app script. The client reads it on its first `now()` or `useNow()`, before hydration, and releases it one macrotask later so real time takes over with one update.',
      example: `clockScript({ instant: 1000 })                // => '<script>window.__PYREON_CLOCK__=1000</script>'`,
      seeAlso: ['clockAttributes', 'provideClock'],
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'clockAttributes',
      kind: 'function',
      signature: '(instant?: number) => { "data-pyreon-clock": string }',
      summary: 'The same hand-over as an attribute, for a page that cannot emit a script (strict CSP): spread it on the `<html>` or `<body>` element.',
      example: `clockAttributes(1000)                         // => { 'data-pyreon-clock': '1000' }`,
      stability: 'experimental',
      since: '0.53.0',
    },
    {
      name: 'releaseClock',
      kind: 'function',
      signature: '() => void',
      summary: 'Hand real time back to the page after hydration: `now()` stops returning the server\'s instant and every ticker is updated once. It runs by itself one macrotask after the first read of a hand-over; call it yourself if your hydration is not synchronous.',
      example: `releaseClock()                                // after a custom async hydration step`,
      stability: 'experimental',
      since: '0.53.0',
    },
    { name: 'Every', kind: 'type', signature: "type Every = 'second' | 'minute' | 'hour' | 'day' | number", summary: 'How often `useNow` updates.', example: `const e: Every = 'minute'`, stability: 'experimental', since: '0.53.0' },
    { name: 'NowOptions', kind: 'type', signature: 'interface NowOptions { every?: Every | (() => Every); zone?: string | (() => string) }', summary: 'Options of `useNow`.', example: `const o: NowOptions = { every: 'second' }`, stability: 'experimental', since: '0.53.0' },
    { name: 'ClockScriptOptions', kind: 'type', signature: 'interface ClockScriptOptions { instant?: number; nonce?: string }', summary: 'Options of `clockScript`.', example: `const o: ClockScriptOptions = { nonce: 'abc' }`, stability: 'experimental', since: '0.53.0' },
  ],
  gotchas: [
    { label: 'Server and client', note: 'On a server nothing ticks: `useNow()` returns the plain read, which is the `provideClock` instant when one is provided and `Date.now()` otherwise. Provide the render instant per request and emit it with `clockScript()` or `clockAttributes()`; otherwise a relative time such as "2 sec ago" can differ between the server HTML and the first client render. Capturing the instant automatically at the first read of a request needs a request-scoped store in `@pyreon/runtime-server`, which does not exist yet.' },
    { label: 'Hydration', note: 'The hand-over is read on the first client `now()` and released one macrotask later. Components that first read the clock later than that (lazy islands) see real time and may mismatch against server HTML rendered at the older instant; call `releaseClock()` yourself after your own async hydration if needed.' },
    { label: 'Tickers are bounded', note: '`second` and `minute` tickers are always shared. Up to 16 other tickers (custom intervals and per-zone `hour`/`day` tickers) are shared; a reader beyond that gets a private ticker that is stopped with it.' },
    { label: 'Peer dependencies', note: '`@pyreon/core` and `@pyreon/reactivity` are both required peers: the entry imports them when it loads, and every Pyreon app has them. The non-reactive story is to pass a locale, zone or instant explicitly to the core entries of `@pyreon/format` and `@pyreon/time`.' },
  ],
  longExample: `import { provideLocale, provideTimeZone, setClock, useNow, now } from '@pyreon/ambient'

// App root: one place says which locale and zone everything below formats in.
provideLocale(() => 'cs')
provideTimeZone('Europe/Prague')

// A live clock: one shared ticker serves every reader of the same granularity.
const seconds = useNow({ every: 'second' })

// Tests: pin the clock for the whole app.
setClock(() => Date.UTC(2026, 10, 18, 12))
now()                                         // => 1795003200000`,
  since: '0.53.0',
})
