---
title: Lathe — coming from orval
description: Move an orval setup to @pyreon/lathe — `lathe init` reads orval.config.ts, and this page maps the client, hooks, mutations, mocks, auth and base URL one by one.
---

[Lathe](/docs/lathe) and orval do the same job — an OpenAPI document in, a
typed client out — so most of a migration is configuration. `lathe init` reads
`orval.config.ts` and does that part; this page covers the code that calls the
client.

The examples use the [Bookshelf example](https://github.com/pyreon/pyreon/tree/main/examples/lathe-bookshelf)'s
API (`listBooks`, `getBook`, `createBook`). Every Lathe block below is
typechecked against that generated client in CI; the orval blocks are
illustrative.

## 1. Run `lathe init`

```bash
npx lathe init
```

It finds `orval.config.ts` (it is read as text — orval does not need to stay
installed), writes a `lathe` section into `pyreon.config.ts`, adds
`lathe:generate` / `lathe:check` scripts, prints the packages to install and
runs the first generate. `--yes` takes every default for CI; `--dry-run` shows
what it would write.

| orval | Lathe |
| --- | --- |
| `input` / `input.target` | `input` (a URL becomes `source`, fetched by `lathe pull`) |
| `output.target` | `output` — a directory; Lathe writes one module per tag |
| `output.client: 'react-query'` (vue-/svelte-/solid-query, swr) | `plugins: [..., 'queries']` — `@pyreon/query` hooks |
| `output.client: 'axios'` / `httpClient: 'axios'` | `client: 'axios'` |
| `output.client: 'zod'` | `validator: 'zod'` |
| `output.httpClient: 'fetch'` | `client: 'fetch'` (or keep the default `pyreon`, the only one that reaches iOS/Android) |
| `output.mock: true` | `plugins: [..., 'mocks', 'faker']` |
| `output.baseUrl` (string) | `baseUrl` |
| `output.mode`, `output.schemas`, `output.clean` | built in: one module per tag, `schemas/`, stale files pruned |
| `output.override.mutator` | runtime middleware — see [Auth](#auth-and-a-custom-instance) |
| `hooks`, `prettier` | chain your formatter after `lathe generate` in the script |

Several APIs in one `orval.config.ts` become `projects`. Anything init cannot
map is listed by name with what to do instead. If your old output directory
still holds orval's files, Lathe writes to `./src/gen` beside it so the app
keeps working until the imports move.

## 2. Queries

```tsx
// orval + react-query
import { useGetBook, useListBooks } from './api/books'

const books = useListBooks()
const book = useGetBook(bookId)
books.data?.map((b) => b.title)
```

Lathe hooks take their arguments as an **accessor**, so a signal inside them
refetches when it changes, and return signals — call them to read.

```tsx
// @check
import { For, type VNodeChild } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { useGetBook, useListBooks } from './gen'

export function Books(): VNodeChild {
  const books = useListBooks()
  return (
    <ul>
      <For each={() => books.data() ?? []} by={(b) => b.id}>
        {(b) => <li>{b.title}</li>}
      </For>
    </ul>
  )
}

const bookId = signal<string | undefined>(undefined)
// `undefined` holds the request until there is an id to fetch.
const book = useGetBook(() => (bookId() ? { params: { bookId: bookId() as string } } : undefined))
book.data()?.title
```

Query options (orval's `query: { … }` override, or a per-call options object)
are the hook's second accessor: `useListBooks(() => ({ staleTime: 60_000 }))`.

## 3. Mutations

```tsx
// orval + react-query
const create = useCreateBook()
create.mutate({ data: { title: 'Dune' } })
```

```ts
// @check
import { useCreateBook } from './gen'

const create = useCreateBook({ onSuccess: (book) => console.log(book.id) })
create.mutate({ json: { title: 'Dune' } })
```

The body key names the encoding: `json` here, `form` / `multipart` / `body`
for the others. A mutation already invalidates the queries it can change
(`listBooks` after `createBook`); pass `invalidates` to change that.

## 4. Mocks: MSW → `installMocks()`

```ts
// orval + msw
import { setupServer } from 'msw/node'
import { getBooksMock } from './api/books.msw'

const server = setupServer(...getBooksMock())
server.listen()
```

Lathe's mocks are middleware on the client itself — no service worker, no
server to start, identical in node and the browser.

```ts
// @check
import { installMocks, mockOperation, resetMocks } from './gen/dev'

installMocks()
// One test needs a failure:
const restore = mockOperation('listBooks', { status: 500, json: { message: 'down' } })
restore()
resetMocks()
```

`createBook()`-style fake-data factories come from the `faker` plugin, in the
same `./gen/dev` entry, which a page bundle can never import.

## 5. Auth and a custom instance

orval's `mutator` is a function every request goes through. In Lathe that is
middleware plus headers, set at runtime:

```ts
// orval mutator
export const customInstance = <T>(config: AxiosRequestConfig): Promise<T> =>
  AXIOS_INSTANCE({ ...config, headers: { Authorization: `Bearer ${getToken()}` } }).then((r) => r.data)
```

```ts
// @check
import type { HttpMiddleware } from '@pyreon/http'
import { signal } from '@pyreon/reactivity'
import { configureApi } from './gen'

const token = signal('')

const retryOn401: HttpMiddleware = async (req, next) => {
  const res = await next(req)
  return res.status === 401 ? next(req) : res
}

configureApi({
  // Re-read on every request, so a new token applies immediately.
  headers: () => ({ Authorization: `Bearer ${token()}` }),
  use: [retryOn401],
})
```

When the spec declares `securitySchemes`, the client also exports a typed
helper per scheme, named after it — `configureApi({ use: [auth.bearerAuth(() => token())] })`
for a scheme called `bearerAuth`.

## 6. Base URL

```ts
// @check
import { configureApi } from './gen'

const staging = true
configureApi({ baseUrl: staging ? 'https://staging.bookshelf.test/v1' : 'https://bookshelf.test/v1' })
```

The spec's `servers[0].url` (or the `baseUrl` config key) is the default;
`configureApi` switches it per environment without regenerating.

## 7. Calling an endpoint directly

orval's plain functions become the generated endpoints — for a loader, a
server route or a script, with no hooks involved:

```ts
// @check
import { getBook } from './gen'

const book = await getBook({ params: { bookId: '1' } })
book.title
```

## What is different on purpose

- **Validation.** Responses are checked against the generated schemas
  (`responseValidation: 'strict' | 'warn' | 'off'`), so a backend that drifts
  fails loudly at the boundary.
- **`lathe check`** fails CI when the committed client is stale against the
  spec, and `--fail-on-breaking` when a spec change breaks your code.
- **Native.** With `target: 'multiplatform'`, the same spec produces modules
  that lower to Swift and Kotlin.

See also: [Lathe](/docs/lathe), [coming from hey-api](/docs/lathe-from-hey-api),
[kubb](/docs/lathe-from-kubb), [openapi-fetch](/docs/lathe-from-openapi-fetch).
