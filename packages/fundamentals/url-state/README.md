# @pyreon/url-state

Signal-backed URL search-param state — type-coerced, SSR-safe, debounce-aware.

Each URL search parameter becomes a Pyreon signal that reads from `window.location.search` and writes back via `history.replaceState` (or `pushState` if you opt in). Type inferred from the default value: `useUrlState('page', 1)` is `Signal<number>`; `useUrlState('q', '')` is `Signal<string>`; `useUrlState('tags', [] as string[])` is `Signal<string[]>`. Two API shapes — single-param (`useUrlState(key, default, opts?)`) and schema (`useUrlState({ page: 1, sort: 'name' })`). Optional `@pyreon/router` integration so URL writes go through your router's `replace()` instead of raw history.

## Install

```bash
bun add @pyreon/url-state @pyreon/reactivity
```

## Quick start

```ts
import { useUrlState } from '@pyreon/url-state'

// Single-param form
const page = useUrlState('page', 1) // Signal<number>, reads ?page=X
page() // 1 — reactive read
page.set(2) // URL becomes ?page=2
page.reset() // back to default (removes ?page when value equals default)
page.remove() // strips ?page entirely AND resets signal to default

// Schema form — multiple params at once
const filters = useUrlState({ page: 1, sort: 'name', q: '' })
filters.q.set('hello') // ?page=1&sort=name&q=hello
filters.sort() // 'name'

// Search-as-you-type with debounce
const query = useUrlState('q', '', { debounce: 300 })
```

## `UrlStateSignal<T>`

| Member | Notes |
|---|---|
| `state()` | Reactive read |
| `state.set(value)` | Write — updates signal AND URL |
| `state.reset()` | Restore the default — URL parameter is removed |
| `state.remove()` | Strip parameter from URL, reset to default |

## Type coercion

Inferred from the default value:

| Default | URL → value | Notes |
|---|---|---|
| `1` (number) | `?page=2` → `2` | Invalid AND empty (`?page=`) values fall back to the **default** (not `NaN` / `0`) |
| `''` (string) | `?q=hello` → `'hello'` | URL-decoded (`+` → space per `application/x-www-form-urlencoded`) |
| `false` (boolean) | `?dark=true` → `true` | `'true'`/`'1'` → `true`, `'false'`/`'0'` → `false`; anything else falls back to the **default** |
| `['']` / `[0]` / `[false]` (array) | `?ids=1,2` → `[1, 2]` | Element type inferred from the default's FIRST element (an empty `[]` default keeps strings). A `,` inside an element is escaped. An element that does not parse makes the whole value fall back to the default. `arrayFormat: 'comma'` (default) or `'repeat'` |
| `{}` (object) | `?filter=%7B...%7D` → object | JSON encoded |

For non-standard shapes, supply a custom `serialize` and/or `deserialize` — either half alone is honoured, the other is inferred from the default. With `arrayFormat: 'repeat'` a custom codec is applied **per element**.

## Options

```ts
interface UrlStateOptions<T> {
  serialize?: (value: T) => string
  deserialize?: (raw: string) => T
  replace?: boolean // default true — replaceState; false for pushState
  debounce?: number // default 0; coalesce rapid set() calls
  arrayFormat?: 'comma' | 'repeat' // default 'comma'
  clearOnDefault?: boolean // default true — drop the param when it equals the default
  onChange?: (value: T) => void // external changes that actually CHANGED the value (popstate / router navigation / cross-hook)
}
```

## Custom serialization

```ts
type DateRange = { from: Date; to: Date }

const range = useUrlState<DateRange>('range', { from: new Date(), to: new Date() }, {
  serialize: (r) => `${r.from.toISOString()}_${r.to.toISOString()}`,
  deserialize: (raw) => {
    const [from, to] = raw.split('_')
    return { from: new Date(from), to: new Date(to) }
  },
})
```

## Array encoding

```ts
const tags = useUrlState('tags', [] as string[], { arrayFormat: 'repeat' })
tags.set(['a', 'b']) // ?tags=a&tags=b   (instead of ?tags=a,b)
```

Use `'repeat'` when your backend reads search params with `URLSearchParams.getAll(key)` (PHP, Express's default `qs` config, FastAPI's `List[str]`).

## Debounce — search inputs

```ts
const q = useUrlState('q', '', { debounce: 300 })

const Input = () => (
  <input
    value={q()}
    onInput={(e) => q.set(e.currentTarget.value)}
  />
)
// Signal updates immediately; URL writes coalesce to one every 300ms idle.
```

## Router integration

By default `useUrlState` writes to `window.history`. Wire it through `@pyreon/router` so URL changes go through your router's `replace()`:

```ts
import { setUrlRouter } from '@pyreon/url-state'
import { router } from './router' // your @pyreon/router instance

setUrlRouter(router)
```

The `UrlRouter` interface is minimal:

```ts
interface UrlRouter {
  replace(path: string): void | Promise<void>
  push?(path: string): void | Promise<void>
  mode?: 'hash' | 'history'
  _base?: string
  currentRoute?: () => unknown // when present, navigations update every live signal
}
```

Any object satisfying it works (you don't strictly need `@pyreon/router`).

With `currentRoute` present (every `@pyreon/router` instance has it), a navigation
made through the router — `router.push('/products?page=2')`, a `<RouterLink>`
click — updates every live `useUrlState` signal. Without a registered router,
only `popstate` and url-state's own writes are observed: a raw
`history.pushState` fires no event.

### The router decides WHERE the params live

`@pyreon/router` defaults to `mode: 'hash'`, where the whole route — **query
included** — lives in the fragment and `location.search` stays empty:

```
https://app.example/#/products?page=3
                     ^^^^^^^^^^^^^^^^ the router owns all of this
```

So once a router is registered, `useUrlState` reads and writes the query on the
side of the URL that router owns: inside the fragment in hash mode, in
`location.search` in history mode (where it also preserves any `#fragment` and
hands the router a path relative to its `base`). `useRouter()` exposes `mode`, so
`setUrlRouter(useRouter())` picks this up with no extra configuration.

One consequence worth stating: in a hash-routed app, **do not read the params
with `new URLSearchParams(location.search)`** — that string is empty. Read
through `useUrlState` (or `getParam`), which asks the registered router.

Without a registered router nothing changes: `useUrlState` owns
`location.search` and writes it with `history.replaceState` / `pushState`.

## SSR safety

`useUrlState` reads the URL **once, when it is created** (not lazily on first read) and never touches the DOM during SSR. On the server it returns the default value. On the client the signal is created with the actual URL value, so a server-rendered default and a client value can differ for a URL that carries the param — render URL-dependent markup client-only (or pass the request's search params to the server render) if that matters.

## Popstate sync

Back / forward buttons trigger a `popstate` event; every active `useUrlState` re-reads from the URL and notifies subscribers. The `onChange` option fires on external updates (popstate, a navigation through the registered router, OR a different `useUrlState` call updating the same param) — and only when the value actually changed.

## Cross-hook sync

Two `useUrlState('page', 1)` calls in different components are **independent signals bound to the same parameter** — and they stay in sync. When one writes, the other re-reads the URL and updates, firing its `onChange`:

```ts
const a = useUrlState('page', 1) // in <Header/>
const b = useUrlState('page', 1) // in <Pagination/>

a.set(5) // b() is now 5 too — and b's onChange fires
```

You don't need to lift the signal into a store to share URL state across the tree — just bind the same key. (Sharing one signal is still fine and slightly cheaper; cross-hook sync is for the case where two independently-authored components happen to bind the same param.)

## Batched updates

Setting several parameters in schema mode writes the URL once per `.set()`. To collapse a multi-parameter update into **one** history entry (one `replaceState` / `pushState` / `router.replace`), wrap the writes in `batchUrlUpdates`:

```ts
import { batchUrlUpdates } from '@pyreon/url-state'

const { page, q, sort } = useUrlState({ page: 1, q: '', sort: 'name' })

batchUrlUpdates(() => {
  page.set(1)
  q.set('hello')
  sort.set('date')
}) // → one history entry: ?q=hello&sort=date
```

This matters most with `replace: false`: without batching, a three-param "apply filters" click would push **three** history entries, so the back button would step through each intermediate state. Inside a batch, signal values still update synchronously (only the URL write is deferred to the end), debounce is bypassed, and reactive subscribers reading multiple params re-run once. If any write in the batch requested `replace: false`, the single batched write uses `pushState`.

## `clearOnDefault`

By default a parameter is **removed** from the URL when its value equals the default, keeping URLs canonical. Pass `clearOnDefault: false` to always write the parameter — useful when the default must be explicit (shareable canonical links, analytics):

```ts
const sort = useUrlState('sort', 'name', { clearOnDefault: false })
sort.set('name') // URL keeps ?sort=name instead of dropping it
```

## Gotchas

- **`set()` does NOT trigger navigation** — it uses `history.replaceState` (or `pushState` if `replace: false`). Use `@pyreon/router`'s `push` / `replace` for real navigations.
- **`reset()` removes the param** when the value equals the default (keeps the URL clean). `remove()` removes it unconditionally.
- **NaN guard**: non-numeric AND empty strings fall back to the **default value**, not `NaN` / `0` — typed-number params can't end up with an unusable or accidental value.
- **Object values are JSON-encoded** — pass `serialize` / `deserialize` for short-form encodings if URL length matters.
- **`debounce: 300` debounces the URL write, not the signal** — `state()` reflects the latest `set()` immediately, only the URL lags.
- **Schema mode returns an object** — destructuring captures the signal references, not values. `const { page } = useUrlState({ page: 1 })` then `page()` to read.
- **`'+' → space` in `application/x-www-form-urlencoded`**: querystrings with literal `+` use `%2B` when round-tripping through `useUrlState`.

## Documentation

Full docs: [pyreon.dev/docs/url-state](https://pyreon.dev/docs/url-state) (or `docs/src/content/docs/url-state.md` in this repo).

## License

MIT
