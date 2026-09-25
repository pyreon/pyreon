---
title: Lathe — coming from openapi-fetch
description: Move openapi-typescript + openapi-fetch (and openapi-react-query) to @pyreon/lathe — named, typed endpoints and hooks instead of path strings, plus validation, mocks and auth.
---

`openapi-typescript` generates types and `openapi-fetch` calls endpoints by
their PATH STRING. [Lathe](/docs/lathe) generates a named function per
operation, a hook per operation, and runtime schemas — so a call site reads
`getBook(...)` instead of `client.GET('/books/{bookId}', ...)`, and a response
that does not match the spec fails at the boundary rather than deep in the UI.

The examples use the [Bookshelf example](https://github.com/pyreon/pyreon/tree/main/examples/lathe-bookshelf)'s
API. Every Lathe block is typechecked against that generated client in CI; the
openapi-fetch blocks are illustrative.

## 1. Run `lathe init`

```bash
npx lathe init
```

`lathe init` finds the `openapi-typescript <spec> -o <file>` script in
`package.json` and reads the spec path and output directory from it. With
`openapi-fetch` installed it generates the client; with `openapi-react-query`,
the hooks too.

## 2. Calling an operation

```ts
// openapi-fetch
import createClient from 'openapi-fetch'
import type { paths } from './api/v1'

const client = createClient<paths>({ baseUrl: 'https://bookshelf.test/v1' })
const { data, error } = await client.GET('/books/{bookId}', {
  params: { path: { bookId: '1' } },
})
```

```ts
// @check
import { configureApi, getBook, listBooks } from './gen'

configureApi({ baseUrl: 'https://bookshelf.test/v1' })
const book = await getBook({ params: { bookId: '1' } })
const all = await listBooks()
book.title
all.length
```

Path parameters are `params`, query parameters `query`, the body `json` (or
`form` / `multipart`). A non-2xx status rejects with the status and the parsed
body instead of returning `{ error }`.

## 3. Hooks (openapi-react-query)

```tsx
// openapi-react-query
const $api = createClient(fetchClient)
const book = $api.useQuery('get', '/books/{bookId}', { params: { path: { bookId } } })
const create = $api.useMutation('post', '/books')
```

```tsx
// @check
import { signal } from '@pyreon/reactivity'
import { useCreateBook, useGetBook } from './gen'

const bookId = signal('1')
const book = useGetBook(() => ({ params: { bookId: bookId() } }))
book.data()?.title

const create = useCreateBook()
create.mutate({ json: { title: 'Dune' } })
```

## 4. Middleware and auth

```ts
// openapi-fetch
client.use({
  onRequest({ request }) {
    request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
})
```

```ts
// @check
import type { HttpMiddleware } from '@pyreon/http'
import { configureApi } from './gen'

let token = ''
const logger: HttpMiddleware = async (req, next) => {
  const res = await next(req)
  console.warn(req.method, req.url, res.status)
  return res
}

configureApi({ headers: () => ({ Authorization: `Bearer ${token}` }), use: [logger] })
token = 'signed-in'
```

## 5. Mocks

openapi-fetch leaves mocking to you (usually MSW). Add `mocks` to `plugins`
and the client answers from spec-derived fixtures:

```ts
// @check
import { installMocks, resetMocks } from './gen/dev'

installMocks()
resetMocks()
```

## 6. Types only

If you used openapi-typescript for TYPES alone, `plugins: ['schemas']` emits
the model types (`Book`, `NewBook`) together with runtime schemas and nothing
else; `plugins: ['types']` emits the types with no runtime at all.

See also: [Lathe](/docs/lathe), [coming from orval](/docs/lathe-from-orval),
[hey-api](/docs/lathe-from-hey-api), [kubb](/docs/lathe-from-kubb).
