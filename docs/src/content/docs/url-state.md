---
title: URL State
description: Reactive signals synced to URL query parameters — auto type coercion, debounce, SSR-safe.
---

`@pyreon/url-state` turns URL search parameters into reactive signals. Read `?page=2` into a signal, write it back with `page.set(3)`, and the browser URL updates automatically — no manual `URLSearchParams` plumbing, no `popstate` listeners, no `typeof window` checks. Each parameter is a fine-grained signal, so a component that reads `page()` re-renders only when `page` changes.

<PackageBadge name="@pyreon/url-state" href="/docs/url-state" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/url-state
```

```bash [bun]
bun add @pyreon/url-state
```

```bash [pnpm]
pnpm add @pyreon/url-state
```

```bash [yarn]
yarn add @pyreon/url-state
```

:::

Peer dependency: `@pyreon/reactivity`. Optional: `@pyreon/router` (for [router integration](#router-integration)).

## Quick Start

```tsx
import { useUrlState } from '@pyreon/url-state'

const page = useUrlState('page', 1)

page()        // 1 — or the value parsed from ?page=… if present
page.set(2)   // URL → ?page=2 (via history.replaceState)
page.reset()  // back to the default (1) — removes ?page from the URL
page.remove() // removes ?page entirely and resets the signal to 1
```

<Example file="./examples/url-state/url-synced-state" title="URL-synced State" />

The default value (`1`) does two jobs: it is the value used when the parameter is absent from the URL, **and** it determines how the raw string is coerced — a number default coerces to a number, a boolean default coerces to a boolean, and so on.

## Why URL State?

Some state belongs in the URL: the current page of a paginated list, the active tab, a search query, applied filters, a selected sort order. Putting it there makes the view **shareable, bookmarkable, and back-button-friendly** — paste the URL to a teammate and they see exactly what you see.

Done by hand, that means reading `window.location.search`, parsing it, coercing strings to the right types, writing changes back with `history.replaceState`, listening to `popstate` for back/forward navigation, and guarding every access for SSR. `useUrlState` collapses all of that into a single signal:

```tsx
// ❌ By hand — parsing, coercion, write-back, popstate, SSR guards
function readPage() {
  if (typeof window === 'undefined') return 1
  const raw = new URLSearchParams(window.location.search).get('page')
  return raw === null ? 1 : Number(raw)
}
// ...plus a popstate listener, plus a replaceState writer, plus a signal

// ✅ With useUrlState — one line
const page = useUrlState('page', 1)
```

Because the result is a signal, it composes with the rest of Pyreon: read it in JSX or a `computed`, derive from it, pass it to `@pyreon/query` as part of a query key. The URL becomes just another reactive source.

## Single Parameter

`useUrlState(key, default)` binds one search parameter. The return type matches the default:

```tsx
const page = useUrlState('page', 1)        // UrlStateSignal<number>
const active = useUrlState('active', true) // UrlStateSignal<boolean>
const q = useUrlState('q', '')             // UrlStateSignal<string>
const tags = useUrlState('tags', ['a'])    // UrlStateSignal<string[]>
```

Read by calling, write with `.set()`:

```tsx
function Pagination() {
  const page = useUrlState('page', 1)
  return (
    <div>
      <button onClick={() => page.set(page() - 1)}>Prev</button>
      <span>Page {page()}</span>
      <button onClick={() => page.set(page() + 1)}>Next</button>
    </div>
  )
}
```

`page()` is reactive: the `<span>` re-renders when `page` changes — including when the user presses the browser **back** button (see [Back/Forward Navigation](#backforward-navigation)).

## Type Coercion

The serializer/deserializer pair is inferred from the **type of the default value**. The raw URL string is coerced on read; the value is stringified on write.

| Default type     | URL string  | Read value        | Notes                                                       |
| ---------------- | ----------- | ----------------- | ----------------------------------------------------------- |
| `number`         | `"42"`      | `42`              | `Number(raw)`; falls back to the default if `NaN`           |
| `boolean`        | `"true"`    | `true`            | Only the exact string `"true"` is `true`; anything else `false` |
| `string`         | `"hello"`   | `"hello"`         | Used verbatim                                               |
| `string[]`       | `"a,b,c"`   | `['a', 'b', 'c']` | Comma-joined by default — see [Array Parameters](#array-parameters) |
| `object`         | `'{"a":1}'` | `{ a: 1 }`        | Auto `JSON.stringify` / `JSON.parse`                        |

```tsx
const page = useUrlState('page', 1)
// URL ?page=42  →  page() === 42  (number)
// URL ?page=xyz →  page() === 1   (NaN → falls back to default)

const active = useUrlState('active', false)
// URL ?active=true  →  active() === true
// URL ?active=1     →  active() === false  (only "true" is true)
```

:::warning[Match the default's type to the desired coercion]
Coercion is driven entirely by the default value's type. `useUrlState('page', 1)` coerces `?page=2` to the number `2`; `useUrlState('page', '1')` keeps it as the **string** `"1"`. If you read a number out of a `string`-defaulted signal, you'll be doing math on strings. Always supply the default in the type you want back.
:::

:::note[Object defaults use JSON automatically]
An object default (`useUrlState('filter', { min: 0 })`) is serialized with `JSON.stringify` and parsed with `JSON.parse` — no custom serializer needed. The URL value will be the URL-encoded JSON. For shorter URLs or non-JSON encodings, supply a [custom serializer](#custom-serializers).
:::

## Schema Mode

Pass an object to bind several parameters in one call. Each key becomes its own `UrlStateSignal`:

```tsx
const params = useUrlState({ page: 1, sort: 'name', q: '' })

params.page()      // 1
params.sort()      // 'name'
params.q()         // ''

params.page.set(2)     // ?page=2
params.sort.set('date') // ?sort=date
params.q.reset()        // removes ?q
```

Destructuring works too:

```tsx
const { page, sort, q } = useUrlState({ page: 1, sort: 'name', q: '' })
page.set(2)
```

Schema mode is exactly `useUrlState(key, default)` called once per key — each signal is independent. Setting `page` does not touch `sort`. Per-key type coercion follows the same rules as single-parameter mode, inferred from each default value.

Options apply to **all** keys in the schema (the second argument):

```tsx
const filters = useUrlState({ q: '', sort: 'name' }, { debounce: 300 })
// both q and sort debounce their URL writes by 300ms
```

## Reading Reactively

Components run once in Pyreon — reactivity comes from *where* you read the signal. Read `state()` inside JSX, an `effect`, or a `computed` to track changes:

```tsx
const q = useUrlState('q', '')

// ✅ Reactive — the <p> updates when q changes (typing, back button, etc.)
function SearchLabel() {
  return <p>Searching for: {q()}</p>
}

// ✅ Reactive — derive other state from the URL
const isSearching = computed(() => q().length > 0)

// ⚠️ Captured once — `current` never updates after setup
const current = q()
```

:::warning[Don't snapshot the value at setup]
`const current = q()` reads the URL **once** and freezes it. To track URL changes, call the signal inside a reactive scope — JSX, `effect`, or `computed`. This is the same rule as every Pyreon signal.
:::

## Updating the URL

A `UrlStateSignal` exposes three mutators:

```tsx
const page = useUrlState('page', 1)

page.set(5)   // signal → 5, URL → ?page=5
page.reset()  // signal → default (1), URL param removed
page.remove() // signal → default (1), URL param removed, any pending debounce cancelled
```

`set` and `reset` go through the debounce timer (if configured); `remove` writes **immediately** and cancels a pending debounced write so a removed parameter can't be resurrected by a stale timer.

### Default values clean the URL

When a value equals the default, the parameter is **dropped from the URL** rather than written as `?page=1`. This keeps URLs short and canonical — the default state has no query string:

```tsx
const page = useUrlState('page', 1)

page.set(3)  // ?page=3
page.set(1)  // back to default → URL has no ?page at all (not ?page=1)
```

`reset()` relies on this: it sets the signal to the default, which removes the parameter. `remove()` force-removes the parameter regardless of the current value.

## Options

```tsx
const q = useUrlState('q', '', {
  debounce: 300,
  replace: true,
  arrayFormat: 'comma',
  serialize: (v) => v,
  deserialize: (raw) => raw,
  onChange: (value) => trackSearch(value),
})
```

| Option        | Type                     | Default     | Description                                                              |
| ------------- | ------------------------ | ----------- | ------------------------------------------------------------------------ |
| `replace`     | `boolean`                | `true`      | `true` → `history.replaceState` (no history entry); `false` → `history.pushState` |
| `debounce`    | `number`                 | `0`         | Debounce URL writes by this many milliseconds (signal still updates instantly) |
| `arrayFormat` | `'comma' \| 'repeat'`    | `'comma'`   | Array encoding: `?tags=a,b` vs `?tags=a&tags=b`                           |
| `serialize`   | `(value: T) => string`   | inferred    | Custom value → string. Must be paired with `deserialize`                 |
| `deserialize` | `(raw: string) => T`     | inferred    | Custom string → value. Must be paired with `serialize`                   |
| `onChange`    | `(value: T) => void`     | —           | Called on **external** changes only (popstate, or another signal writing the same param) |

:::note[`serialize` and `deserialize` are a pair]
Custom (de)serialization only takes effect when **both** `serialize` and `deserialize` are supplied. If you pass only one, the inferred serializer for the default's type is used instead.
:::

## Debounced Updates

High-frequency inputs (search boxes, sliders) would otherwise fire a `replaceState` on every keystroke. `debounce` batches URL writes — the **signal updates synchronously** (so the input stays responsive), and only the URL write is delayed until the user pauses:

```tsx
function Search() {
  const q = useUrlState('q', '', { debounce: 300 })
  return (
    <input
      value={q()}                                   // signal updates instantly
      onInput={(e) => q.set(e.currentTarget.value)} // URL updates 300ms after last keystroke
    />
  )
}
```

Typing `hello` fires a single URL update 300ms after the last keystroke, not five.

:::warning[Don't pair `replace: false` with a debounced high-frequency input]
`replace: false` adds a browser history entry per write. Even debounced, on a frequently-edited field this pollutes the back stack — every pause becomes a back-button step. Keep `replace: true` (the default) for anything the user edits rapidly. `replace: false` is for navigations the user should be able to step back through (e.g. moving between distinct pages).
:::

## Array Parameters

Arrays of strings are supported with two encodings, selected via `arrayFormat`:

```tsx
// Comma format (default): ?tags=react,vue,pyreon
const tags = useUrlState('tags', ['react'], { arrayFormat: 'comma' })

// Repeat format: ?tags=react&tags=vue&tags=pyreon
const tags = useUrlState('tags', ['react'], { arrayFormat: 'repeat' })

tags.set(['react', 'vue']) // updates the URL in the chosen format
```

Both formats round-trip cleanly:

```tsx
const tags = useUrlState('tags', [] as string[], { arrayFormat: 'repeat' })
tags.set(['typescript', 'pyreon'])  // ?tags=typescript&tags=pyreon
tags()                              // ['typescript', 'pyreon']
```

An empty array (or one equal to the default array) removes the parameter, consistent with the [default-cleanup rule](#default-values-clean-the-url).

:::note[`comma` vs `repeat`]
Use `comma` for the shortest URLs. Use `repeat` if your values may legitimately contain commas (the comma encoder splits on `,` so a value like `"a,b"` would be read back as two entries). Repeat format avoids that ambiguity.
:::

## Custom Serializers

For types without built-in coercion, or to control the wire format, supply a `serialize`/`deserialize` pair. A common use is compacting an object into a short token:

```tsx
const filters = useUrlState(
  'f',
  { status: 'active', role: 'admin' },
  {
    serialize: (v) => btoa(JSON.stringify(v)),
    deserialize: (s) => JSON.parse(atob(s)),
  },
)
```

Your serializer is responsible for producing a URL-safe string. (Plain objects already work via the built-in JSON serializer — reach for a custom pair only when you need a different encoding.)

## Back/Forward Navigation

`useUrlState` listens for the browser's `popstate` event. Pressing **back** or **forward** re-reads the parameter from the URL and updates the signal — so anything reading it re-renders to match the restored URL:

```tsx
const page = useUrlState('page', 1)
// User: page.set(2) → page.set(3) → presses Back
// → popstate fires → page() reflects the previous URL value
```

`onChange` fires for exactly these external updates (popstate, or another `useUrlState` instance writing the same parameter) — **not** for your own `.set()` / `.reset()` calls:

```tsx
const q = useUrlState('q', '', {
  onChange: (value) => analytics.track('search_restored', { q: value }),
})
```

The listener is registered inside an `effect`, so it's tied to the owning reactive scope: created when the signal is created, and torn down (along with any pending debounce timer) when that scope is disposed.

## Router Integration

By default URL writes go through `history.replaceState` / `history.pushState`. If you use `@pyreon/router`, call `setUrlRouter(router)` once at app setup so URL updates route through the router instead — keeping route guards, middleware, and scroll management consistent:

```tsx
import { useRouter } from '@pyreon/router'
import { setUrlRouter } from '@pyreon/url-state'

const router = useRouter()
setUrlRouter(router)
// useUrlState now calls router.replace(url) for every write
```

`setUrlRouter` takes any object with a `replace(path)` method (the `UrlRouter` interface) — you are not forced to use `@pyreon/router`.

:::warning[When a router is set, the `replace` option is ignored]
With a router registered, **every** URL write goes through `router.replace(url)` regardless of the per-signal `replace` option — there is no `pushState` path through the router. Register the router before any `useUrlState` write that should be routed; calling `setUrlRouter` afterwards only affects subsequent writes.
:::

:::note[Register the router after it exists]
Don't call `setUrlRouter` before the router instance is available (e.g. during early SSR setup where no router exists yet). Wire it up where you have a live router — typically your client entry or root component setup.
:::

## SSR

`useUrlState` is SSR-safe with no environment checks in your component code:

- On the **server** (`isClient === false`): reads return `null`, so every signal initializes to its **default value**. No `popstate` listener is attached, and no `history` calls are made.
- On the **client**: signals initialize from `window.location.search`, the `popstate` listener is registered, and writes hit `history` (or the router).

```tsx
// Renders identically on server and client — no typeof window guard needed
function Tabs() {
  const tab = useUrlState('tab', 'overview')
  return <nav class={tab() === 'overview' ? 'active' : ''}>…</nav>
}
```

:::warning[Server renders use defaults, not the request URL]
On the server, parameters fall back to their **default values** — the server-rendered HTML reflects the default state, and the actual URL parameters are applied on the client after hydration. If a parameter must be present in the server-rendered output (e.g. for SEO of a filtered list), read it from your route/loader layer and seed your render from there rather than relying on `useUrlState` to surface it during SSR.
:::

## TypeScript

The signal's type is inferred from the default value — no manual annotations needed in the common case:

```tsx
const page = useUrlState('page', 1)     // UrlStateSignal<number>
const q = useUrlState('q', '')          // UrlStateSignal<string>
const tags = useUrlState('tags', [] as string[]) // annotate empty arrays
```

The public types are exported for advanced usage:

```ts
import type {
  ArrayFormat,     // 'comma' | 'repeat'
  Serializer,      // { serialize, deserialize } pair for a type
  UrlStateOptions, // the options object
  UrlStateSignal,  // the returned signal accessor
} from '@pyreon/url-state'

import type { UrlRouter } from '@pyreon/url-state' // the setUrlRouter argument shape
```

## API Reference

### `useUrlState(key, default, options?)`

Single-parameter overload. Returns a [`UrlStateSignal<T>`](#urlstatesignalt).

| Parameter      | Type                  | Description                                                 |
| -------------- | --------------------- | ----------------------------------------------------------- |
| `key`          | `string`              | The URL search-parameter name                               |
| `defaultValue` | `T`                   | Value when the param is absent; its type drives coercion    |
| `options`      | `UrlStateOptions<T>?` | See [`UrlStateOptions`](#urlstateoptionst)                  |

```ts
function useUrlState<T>(
  key: string,
  defaultValue: T,
  options?: UrlStateOptions<T>,
): UrlStateSignal<T>
```

### `useUrlState(schema, options?)`

Schema overload. Returns an object mapping each schema key to its own `UrlStateSignal`.

| Parameter | Type                       | Description                                            |
| --------- | -------------------------- | ------------------------------------------------------ |
| `schema`  | `Record<string, unknown>`  | Object of `key → defaultValue`                         |
| `options` | `UrlStateOptions?`         | Applied to **every** parameter in the schema           |

```ts
function useUrlState<T extends Record<string, unknown>>(
  schema: T,
  options?: UrlStateOptions,
): { [K in keyof T]: UrlStateSignal<T[K]> }
```

### `setUrlRouter(router)`

Configure `useUrlState` to write URLs through a router instead of the raw history API. Module-level — affects all `useUrlState` instances. Pass `null` to clear.

```ts
function setUrlRouter(router: UrlRouter | null): void

interface UrlRouter {
  replace(path: string): void | Promise<void>
}
```

### `UrlStateSignal<T>`

The callable signal returned for each parameter.

| Member       | Signature              | Description                                                                 |
| ------------ | ---------------------- | --------------------------------------------------------------------------- |
| `()`         | `() => T`              | Read the current value reactively                                           |
| `.set(value)`| `(value: T) => void`   | Update the signal and write the URL (debounced if `debounce` is set)        |
| `.reset()`   | `() => void`           | Set the signal to the default; the param is removed from the URL            |
| `.remove()`  | `() => void`           | Reset the signal to the default and **immediately** remove the param (cancels any pending debounced write) |

### `UrlStateOptions<T>`

| Property      | Type                   | Default   | Description                                                              |
| ------------- | ---------------------- | --------- | ------------------------------------------------------------------------ |
| `replace`     | `boolean`              | `true`    | `replaceState` (true) vs `pushState` (false). Ignored when a router is set |
| `debounce`    | `number`               | `0`       | Milliseconds to debounce URL writes (signal updates stay synchronous)    |
| `arrayFormat` | `ArrayFormat`          | `'comma'` | Array encoding strategy                                                  |
| `serialize`   | `(value: T) => string` | inferred  | Custom serializer; only used when paired with `deserialize`              |
| `deserialize` | `(raw: string) => T`   | inferred  | Custom deserializer; only used when paired with `serialize`              |
| `onChange`    | `(value: T) => void`   | —         | Called on external param changes (popstate / another signal), not on local writes |

### `ArrayFormat`

```ts
type ArrayFormat =
  | 'comma'  // ?tags=a,b
  | 'repeat' // ?tags=a&tags=b
```

### `Serializer<T>`

```ts
interface Serializer<T> {
  serialize: (value: T) => string
  deserialize: (raw: string) => T
}
```
