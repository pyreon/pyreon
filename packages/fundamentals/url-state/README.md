# @pyreon/url-state

Reactive signals synced to URL query parameters.

## Install

```bash
bun add @pyreon/url-state
```

## Usage

```ts
import { useUrlState } from '@pyreon/url-state'

// Single param — auto type coercion from default value
const page = useUrlState('page', 1) // reads ?page=X, defaults to 1
page() // 1
page.set(2) // URL becomes ?page=2
page.reset() // back to default
page.remove() // removes ?page entirely

// Schema mode — multiple params
const { page, sort, q } = useUrlState({ page: 1, sort: 'name', q: '' })

// Debounced (for search inputs)
const q = useUrlState('q', '', { debounce: 300 })
```

## Features

- Auto type coercion (number, boolean, string, string[], object)
- `replaceState` by default (no history pollution)
- Debounced URL writes
- `popstate` sync (back/forward buttons)
- SSR-safe (returns defaults when no window)
- Optional `@pyreon/router` integration
- Array encoding: `"comma"` or `"repeat"` format

## License

MIT
