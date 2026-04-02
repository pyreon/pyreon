---
title: URL State
description: Reactive signals synced to URL query parameters — auto type coercion, debounce, SSR-safe
---

# @pyreon/url-state

Reactive signals synced to URL search parameters. Read `?page=2` into a signal, write it back with `page.set(3)` — the URL updates automatically via `history.replaceState`.

## Installation

::: code-group

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

Peer dependencies: `@pyreon/reactivity`

Optional peer: `@pyreon/router`

## Quick Start

```tsx
import { useUrlState } from '@pyreon/url-state'

const page = useUrlState('page', 1)

page()       // 1 (or value from URL)
page.set(2)  // URL becomes ?page=2
page.reset() // back to default (1)
page.remove() // removes ?page entirely
```

## Single Parameter

```tsx
const page = useUrlState('page', 1)       // number
const active = useUrlState('active', true) // boolean
const q = useUrlState('q', '')             // string
const tags = useUrlState('tags', ['a'])    // string[]
```

Type is inferred from the default value. The URL string is automatically coerced to the correct type on read.

### Type Coercion Rules

| Default Value    | URL String    | Parsed Value      |
| ---------------- | ------------- | ----------------- |
| `1` (number)     | `"42"`        | `42`              |
| `true` (boolean) | `"false"`     | `false`           |
| `''` (string)    | `"hello"`     | `"hello"`         |
| `['a']` (array)  | `"a,b,c"`    | `['a', 'b', 'c']` |

## Schema Mode

Manage multiple URL parameters from a single call:

```tsx
const params = useUrlState({ page: 1, sort: 'name', q: '' })

params.page()       // 1
params.sort()       // 'name'
params.q()          // ''

params.page.set(2)
params.sort.set('date')
params.q.reset()
```

Each key returns a `UrlStateSignal<T>` with `.set()`, `.reset()`, and `.remove()`.

## Options

```tsx
const q = useUrlState('q', '', {
  debounce: 300,
  replace: true,
  arrayFormat: 'comma',
  onChange: (value) => trackSearch(value),
})
```

| Option        | Type                      | Default   | Description                                           |
| ------------- | ------------------------- | --------- | ----------------------------------------------------- |
| `serialize`   | `(value: T) => string`    | auto      | Custom serializer for complex types                   |
| `deserialize` | `(raw: string) => T`      | auto      | Custom deserializer for complex types                 |
| `replace`     | `boolean`                 | `true`    | Use `replaceState` (true) or `pushState` (false)      |
| `debounce`    | `number`                  | `0`       | Debounce URL writes by this many ms                   |
| `arrayFormat` | `'comma' \| 'repeat'`    | `'comma'` | Array encoding: `?tags=a,b` vs `?tags=a&tags=b`      |
| `onChange`     | `(value: T) => void`     | —         | Called on external changes (popstate, other signals)   |

## Debounced Updates

For high-frequency changes like search inputs, debounce prevents URL spam:

```tsx
const search = useUrlState('q', '', { debounce: 300 })

// In an input handler — URL updates 300ms after the last keystroke
<input
  value={search()}
  onInput={(e) => search.set(e.currentTarget.value)}
/>
```

## Array Parameters

```tsx
// Comma format (default): ?tags=react,vue,pyreon
const tags = useUrlState('tags', ['react'], { arrayFormat: 'comma' })

// Repeat format: ?tags=react&tags=vue&tags=pyreon
const tags = useUrlState('tags', ['react'], { arrayFormat: 'repeat' })
```

## Router Integration

If `@pyreon/router` is available, URL updates can go through the router instead of raw `history.replaceState`:

```tsx
import { setUrlRouter } from '@pyreon/url-state'
import { useRouter } from '@pyreon/router'

// In your app setup
const router = useRouter()
setUrlRouter(router)
```

## Custom Serializers

For complex types that don't have automatic coercion:

```tsx
const filters = useUrlState('filters', { status: 'active', role: 'admin' }, {
  serialize: (v) => btoa(JSON.stringify(v)),
  deserialize: (s) => JSON.parse(atob(s)),
})
```

## Back/Forward Navigation

`useUrlState` listens to the `popstate` event — pressing back/forward in the browser updates the signal automatically.

## SSR

On the server (`typeof window === 'undefined'`), `useUrlState` returns signals initialized to their default values. No `popstate` listener is attached, no `history` calls are made.

## TypeScript

```ts
import type {
  ArrayFormat,
  Serializer,
  UrlStateOptions,
  UrlStateSignal,
} from '@pyreon/url-state'
```
