---
title: Lathe — coming from hey-api
description: Move an @hey-api/openapi-ts setup to @pyreon/lathe — `lathe init` reads openapi-ts.config.ts, and this page maps the SDK, TanStack Query options, interceptors, auth and base URL.
---

[Lathe](/docs/lathe) covers what `@hey-api/openapi-ts` and its plugins
generate — types, an SDK, TanStack Query helpers, zod schemas — as one
configuration with one set of names. `lathe init` reads `openapi-ts.config.ts`;
this page covers the code that calls the client.

The examples use the [Bookshelf example](https://github.com/pyreon/pyreon/tree/main/examples/lathe-bookshelf)'s
API. Every Lathe block is typechecked against that generated client in CI; the
hey-api blocks are illustrative.

## 1. Run `lathe init`

```bash
npx lathe init
```

| hey-api | Lathe |
| --- | --- |
| `input` / `input.path` | `input` (a URL becomes `source`, fetched by `lathe pull`) |
| `output` / `output.path` | `output` |
| `@hey-api/client-fetch` (`-next`, `-nuxt`) | the default `client: 'pyreon'` — fetch-based, and the only client that reaches iOS/Android |
| `@hey-api/client-axios` | `client: 'axios'` |
| `@hey-api/typescript`, `@hey-api/schemas` | `plugins: ['schemas']` — types and runtime schemas together |
| `@hey-api/sdk` | `plugins: ['client']` — one endpoint per operation |
| `@tanstack/*-query` | `plugins: ['queries']` — `@pyreon/query` hooks |
| `zod` | `validator: 'zod'` |
| `output.format`, `output.lint` | run your formatter after `lathe generate` in the script |

A plugin with no Lathe equivalent is listed by name; nothing is dropped
silently. When the old output directory still holds hey-api's files, Lathe
writes to `./src/gen` beside it.

## 2. Calling an operation

```ts
// hey-api SDK
import { getBook } from './client'

const { data, error } = await getBook({ path: { bookId: '1' } })
```

Lathe endpoints resolve to the validated body and REJECT on a non-2xx status
(with a typed `status` and body), so there is no `{ data, error }` pair to
unpack. Path parameters are `params`, query parameters `query`.

```ts
// @check
import { getBook } from './gen'

const book = await getBook({ params: { bookId: '1' } })
book.title
```

## 3. Queries and mutations

```tsx
// hey-api + @tanstack/react-query
const books = useQuery(listBooksOptions())
const create = useMutation(createBookMutation())
create.mutate({ body: { title: 'Dune' } })
```

Lathe generates the hook itself rather than an options factory to spread into
one:

```tsx
// @check
import { signal } from '@pyreon/reactivity'
import { useCreateBook, useGetBook, useListBooks } from './gen'

const books = useListBooks()
books.data()?.length

const bookId = signal('1')
// An accessor: a new id refetches.
const book = useGetBook(() => ({ params: { bookId: bookId() } }))
book.data()?.title

const create = useCreateBook()
create.mutate({ json: { title: 'Dune' } })
```

A mutation invalidates the queries it can change (`listBooks` after
`createBook`) unless you pass `invalidates`. The query key of any read is on
`keys` — `keys.books.listBooks.all` — for manual invalidation.

## 4. Base URL, headers and interceptors

```ts
// hey-api
import { client } from './client/client.gen'

client.setConfig({ baseUrl: 'https://api.example.com', auth: () => getToken() })
client.interceptors.request.use((request) => {
  request.headers.set('x-request-id', crypto.randomUUID())
  return request
})
```

```ts
// @check
import type { HttpMiddleware } from '@pyreon/http'
import { configureApi } from './gen'

const requestId: HttpMiddleware = (req, next) => {
  req.headers.set('x-request-id', crypto.randomUUID())
  return next(req)
}

let token = ''
configureApi({
  baseUrl: 'https://bookshelf.test/v1',
  headers: () => ({ Authorization: `Bearer ${token}` }),
  use: [requestId],
})
token = 'signed-in'
```

Each key is independent — setting `headers` keeps the base URL — and read on
every request. With `securitySchemes` in the spec, the client also exports
`auth.<scheme>(credential)` helpers for `use`.

## 5. Mocks

hey-api does not generate mocks, so this is new: add `mocks` (and `faker` for
factories) to `plugins`.

```ts
// @check
import { installMocks, mockCalls, mockOperation } from './gen/dev'

installMocks()
mockOperation('getBook', { status: 404, json: { message: 'no such book' } })
mockCalls.length
```

## 6. Validation

hey-api's `validator: true` on the SDK parses responses with the generated
schemas. Lathe validates every response by default; `responseValidation`
(`'strict' | 'warn' | 'off'`) in the config, or `configureApi({ validate })` at
runtime, changes that.

See also: [Lathe](/docs/lathe), [coming from orval](/docs/lathe-from-orval),
[kubb](/docs/lathe-from-kubb), [openapi-fetch](/docs/lathe-from-openapi-fetch).
