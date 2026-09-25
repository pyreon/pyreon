---
title: Lathe — coming from kubb
description: Move a kubb setup to @pyreon/lathe — `lathe init` reads kubb.config.ts and its plugin calls, and this page maps the client, hooks, zod, faker, MSW, auth and base URL.
---

kubb assembles a generator from plugins; [Lathe](/docs/lathe) ships the same
outputs as named `plugins` in one config. `lathe init` reads `kubb.config.ts`
— its plugin CALLS included, without running them — and this page covers the
code that uses the result.

The examples use the [Bookshelf example](https://github.com/pyreon/pyreon/tree/main/examples/lathe-bookshelf)'s
API. Every Lathe block is typechecked against that generated client in CI; the
kubb blocks are illustrative.

## 1. Run `lathe init`

```bash
npx lathe init
```

| kubb | Lathe |
| --- | --- |
| `root` + `input.path` | `input` |
| `root` + `output.path` | `output` |
| `output.clean` | built in — files Lathe stops generating are removed |
| `pluginOas`, `pluginTs` | built in / `plugins: ['schemas']` |
| `pluginClient({ client: 'axios' \| 'fetch', baseURL })` | `client`, `baseUrl` (without an explicit `client`, Lathe uses `pyreon` rather than kubb's axios default) |
| `pluginReactQuery` (vue/svelte/solid, `pluginSwr`) | `plugins: ['queries']` |
| `pluginZod` | `validator: 'zod'` |
| `pluginFaker` | `plugins: ['faker']` |
| `pluginMsw` | `plugins: ['mocks']` |
| `pluginRedoc` | `plugins: ['docs']` |

Plugin options Lathe has no counterpart for (`dataReturnType`, `suspense`,
custom `transformers`) are listed by name. A `defineConfig(() => ({ … }))`
function is read too.

## 2. Client functions and hooks

```ts
// kubb
import { getBook } from './gen/clients/axios/getBook'
import { useGetBook } from './gen/hooks/useGetBook'

const { data } = await getBook('1')
const query = useGetBook('1')
```

Lathe takes one arguments object shaped like the request (`params`, `query`,
`headers`, the body) rather than positional path parameters, so adding a query
parameter to the spec never shifts an argument.

```ts
// @check
import { getBook, useGetBook, useListBooks } from './gen'

const book = await getBook({ params: { bookId: '1' } })
book.title

const query = useGetBook(() => ({ params: { bookId: '1' } }))
query.data()?.title
useListBooks(() => ({ staleTime: 30_000 })).data()
```

## 3. Mutations

```ts
// @check
import { useCreateBook } from './gen'

const create = useCreateBook({ onError: (e) => console.error(e) })
create.mutate({ json: { title: 'Dune', pages: 412 } })
```

## 4. zod

With `validator: 'zod'` the generated schemas are `z.*`; they are exported
under the model names (`Book`, `NewBook`) next to their types, so
`Book.safeParse(value)` works as it did with `pluginZod`.

## 5. Faker and MSW

```ts
// kubb
import { createBook } from './gen/mocks/createBook'
import { handlers } from './gen/handlers'
setupServer(...handlers).listen()
```

```ts
// @check
import { createBook, installMocks, seedFaker } from './gen/dev'

seedFaker(42)
const book = createBook({ title: 'Pinned title' })
installMocks()
book.id
```

The factories produce data the generated schemas accept (lengths, ranges,
patterns and enums are honoured). The mocks are middleware on the client —
nothing to start or stop.

## 6. Auth and base URL

kubb's generated axios client reads a shared instance you configure. Lathe's
equivalent is `configureApi`, read on every request:

```ts
// @check
import { configureApi } from './gen'

let session: string | undefined
configureApi({
  baseUrl: 'https://bookshelf.test/v1',
  headers: () => (session ? { Authorization: `Bearer ${session}` } : {}),
})
session = 'abc'
```

Keeping axios is one line: `client: 'axios'`. The generated `client.ts` then
exports the axios instance for your own interceptors.

See also: [Lathe](/docs/lathe), [coming from orval](/docs/lathe-from-orval),
[hey-api](/docs/lathe-from-hey-api), [openapi-fetch](/docs/lathe-from-openapi-fetch).
