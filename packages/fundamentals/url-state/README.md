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
| `1` (number) | `?page=2` → `2` | NaN coerces to `0` (not `NaN`) |
| `''` (string) | `?q=hello` → `'hello'` | URL-decoded (`+` → space per `application/x-www-form-urlencoded`) |
| `false` (boolean) | `?dark=1` → `true` | `'1'` / `'true'` truthy, anything else false |
| `[]` (string[]) | `?tags=a,b` → `['a','b']` | `arrayFormat: 'comma'` (default) or `'repeat'` |
| `{}` (object) | `?filter=%7B...%7D` → object | JSON encoded |

For non-standard shapes, supply a custom `serialize` / `deserialize` pair.

## Options

```ts
interface UrlStateOptions<T> {
  serialize?: (value: T) => string
  deserialize?: (raw: string) => T
  replace?: boolean // default true — replaceState; false for pushState
  debounce?: number // default 0; coalesce rapid set() calls
  arrayFormat?: 'comma' | 'repeat' // default 'comma'
  onChange?: (value: T) => void // external changes (popstate / cross-hook)
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
}
```

Any object satisfying it works (you don't strictly need `@pyreon/router`).

## SSR safety

`useUrlState` reads from `window.location.search` lazily on first read and never touches the DOM during SSR. On the server it returns the default value; on hydration it reads the actual URL and updates if it differs. No mismatch warnings.

## Popstate sync

Back / forward buttons trigger a `popstate` event; every active `useUrlState` re-reads from the URL and notifies subscribers. The `onChange` option fires on external updates (popstate OR a different `useUrlState` call updating the same param).

## Gotchas

- **`set()` does NOT trigger navigation** — it uses `history.replaceState` (or `pushState` if `replace: false`). Use `@pyreon/router`'s `push` / `replace` for real navigations.
- **`reset()` removes the param** when the value equals the default (keeps the URL clean). `remove()` removes it unconditionally.
- **NaN guard**: non-numeric strings coerce to `0`, not `NaN` — typed-number params can't end up with the unusable `NaN` value.
- **Object values are JSON-encoded** — pass `serialize` / `deserialize` for short-form encodings if URL length matters.
- **`debounce: 300` debounces the URL write, not the signal** — `state()` reflects the latest `set()` immediately, only the URL lags.
- **Schema mode returns an object** — destructuring captures the signal references, not values. `const { page } = useUrlState({ page: 1 })` then `page()` to read.
- **`'+' → space` in `application/x-www-form-urlencoded`**: querystrings with literal `+` use `%2B` when round-tripping through `useUrlState`.

## Documentation

Full docs: [docs.pyreon.dev/docs/url-state](https://docs.pyreon.dev/docs/url-state) (or `docs/docs/url-state.md` in this repo).

## License

MIT
