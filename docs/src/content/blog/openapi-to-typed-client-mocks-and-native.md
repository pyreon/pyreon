---
title: "One OpenAPI spec in, 29 files out: typed client, query hooks, mocks and native modules"
description: "Stop hand-writing types, fetch calls, query keys and mocks. One command turns a spec into schemas, endpoints, query hooks that refetch what a mutation changed, deterministic mocks, fake data, and Swift and Kotlin modules that lathe compiles to prove they lower."
date: 2027-02-08
slug: openapi-to-typed-client-mocks-and-native
tags: [openapi, typescript, codegen, ios]
cover: /blog/covers/openapi-to-typed-client-mocks-and-native.png
---

You know the routine. The backend team ships an OpenAPI spec. You hand-write the types, then the fetch calls, then the query keys, then the mocks for your tests, and the next time a field changes you fix all four by hand and miss one.

`@pyreon/lathe` does all of it from the spec, in one command. The repo carries a small example, `examples/lathe-bookshelf/openapi.yaml`: two tags, four models, four operations. Run `lathe generate` against it and 29 files come out: schemas, an HTTP client, one endpoint per operation, query hooks, query keys, mock routes, fake-data factories, Markdown reference pages, workbench scenarios, and two `*.native.tsx` modules that Pyreon's native compiler turns into Swift and Kotlin. The app in that example writes no URL, method, query key or response type by hand.

Here is the whole pipeline: the commands, what lands where, how the mocks stay valid, and the native target that checks its own output.

## Install and initialise

```bash
pyreon add @pyreon/lathe
# or: bun add -d @pyreon/lathe
npx @pyreon/lathe init
```

`lathe init` finds what your project generates from today: an orval, `@hey-api/openapi-ts` or kubb config, an `openapi-typescript` script, or a bare `openapi.yaml`/`openapi.json`. Then it:

1. writes a `lathe` section into `pyreon.config.ts`;
2. maps every option it can, and **lists every one it cannot**, with what to do instead;
3. adds `lathe:generate` and `lathe:check` scripts to `package.json`;
4. prints the install command for what the generated code imports;
5. runs the first `lathe generate`.

It never writes into a directory that holds another generator's files, so your old client keeps working until you move the imports. In CI, `--yes` takes every default and `--dry-run` writes nothing. Coming from a specific tool? There are step-by-step guides [from orval](/docs/lathe-from-orval), [from hey-api](/docs/lathe-from-hey-api), [from kubb](/docs/lathe-from-kubb) and [from openapi-fetch](/docs/lathe-from-openapi-fetch).

By hand, the minimum config is two keys (`input`, `output`). This is the bookshelf example's:

```ts
// pyreon.config.ts
export default {
  lathe: {
    input: './openapi.yaml',
    output: './src/gen',
    target: 'multiplatform' as const,
    plugins: ['schemas', 'client', 'queries', 'mocks', 'faker', 'atlas', 'docs'] as const,
    baseUrl: 'http://localhost:5199/v1',
  },
}
```

```bash
lathe generate        # read the spec, write the client
lathe check           # generate in memory; exit 1 if the committed output is stale
```

`plugins` lists the emitters to run; anything you leave out does not run. Leave the setting off and you get `schemas`, `client` and `queries`. When one plugin needs another, lathe adds it and tells you. On the bookshelf config, `lathe check` opens with:

```text
lathe / Bookshelf 1.2.0
  4 models  4 operations  target=multiplatform
  plugins: schemas, client, queries, mocks, faker, atlas, docs (+components - required by them)
```

## What lands where

The generated tree for the bookshelf spec, as committed in the repo:

```text
src/gen/
  index.ts              production entry: schemas, client, endpoints, queries, keys
  dev.ts                fixtures + faker factories (node-safe, no JSX)
  client.ts
  keys.ts               query keys derived from the endpoints
  schemas.ts            re-exports one module per model
  schemas/Book.ts  schemas/Author.ts  schemas/NewBook.ts  schemas/Entity.ts
  endpoints/books.ts  endpoints/authors.ts  endpoints/index.ts
  queries/books.ts  queries/authors.ts  queries/index.ts
  mocks.ts  faker.ts
  components.tsx  atlas.scenarios.ts  atlas.wrapper.tsx
  docs/index.md  docs/books.md  docs/authors.md  docs/models.md
  books.native.tsx  authors.native.tsx
  api-surface.json  lathe-manifest.json  package.json
```

The layout follows the dependency graph, on purpose:

- **Dev code cannot reach production.** `index.ts` does not import `./faker`, `./mocks` or `./components`, so no bundler can pull fixtures into a page by accident. The emitted `package.json` also marks the output side-effect-free, but the guarantee does not lean on that hint: a 24-case matrix in lathe's tests bundles every production entry against every dev surface, with and without the marker.
- **One module per model, and `/* @__PURE__ */` on every emitted call**, so a hook's bundle carries only what that hook uses.
- **Model types are written out**, not inferred. Each model is an `interface` plus a schema cast to `Schema<Book>`, which keeps TypeScript from re-deriving the whole spec in every file that imports it:

```ts
// src/gen/schemas/Book.ts (generated, abridged)
export interface Book {
  id: string
  title: string
  status: 'available' | 'borrowed' | 'lost'
  pages?: number | undefined
  rating?: number | undefined
  /* … */
}
export const Book = /* @__PURE__ */ s.object({
  id: /* @__PURE__ */ s.string().uuid(),
  title: /* @__PURE__ */ s.string().min(1),
  status: /* @__PURE__ */ s.enum(['available', 'borrowed', 'lost'] as const),
  /* … */
}) as unknown as Schema<Book>
```

`lathe-manifest.json` lists every generated file. The next run deletes the files it no longer produces (drop a tag and its endpoint and query modules go with it) and never touches a file that is not on the list.

## Using it

```tsx
import { For, Show } from '@pyreon/core'
import { useCreateBook, useListBooks } from './gen'

function Books() {
  const books = useListBooks()
  return (
    <Show when={() => !books.isPending()} fallback={<p>Loading…</p>}>
      <ul>
        <For each={() => books.data() ?? []} by={(b) => b.id}>
          {(b) => <li>{b.title}</li>}
        </For>
      </ul>
    </Show>
  )
}

function AddBook() {
  const create = useCreateBook()
  return (
    <button onClick={() => create.mutate({ json: { title: 'Added by the generated mutation' } })}>
      Add a book
    </button>
  )
}
```

Every field on a query result is a signal, so you call it: `books.data()`, not `books.data`. And look at what `AddBook` does not do: invalidate anything. A generated mutation refetches every query at or below the collection it changes, so `POST /books` refreshes `listBooks` and `getBook` on success. Pass `invalidates` to change that list, or `[]` to turn it off.

When you do need a key, it comes from the endpoint, so it survives a path change: `keys.books.listBooks.all` matches every call of that endpoint and `keys.books.listBooks.of(args)` matches one. A hook with a path parameter takes an accessor, `useGetBook(() => ({ params: { bookId: id() } }))`, and returning `undefined` from it holds the request until the arguments are ready instead of firing it with a placeholder.

Paginated endpoints work the same way once you declare how they page (lathe never guesses which parameter advances a page): each declaration emits a typed `use<Op>Infinite` hook and an `<op>InfiniteOptions` factory for a loader's prefetch.

> **Change a field in the spec, regenerate, and the types, hooks and mocks move together.**

## Mocks with no server and no service worker

```ts
import { installMocks, mockOperation, resetMocks } from './gen/dev'

beforeEach(installMocks)
afterEach(resetMocks)

it('shows the empty state', async () => {
  mockOperation('listBooks', { json: [] })
  // …
})

it('shows the error state', async () => {
  mockOperation('getBook', { status: 500, json: { message: 'down' }, delay: 50 })
})
```

`@pyreon/http` ships `mock()` as middleware on the client itself. A generated mock is therefore an array of routes, not an MSW service worker: it behaves the same in Node and the browser and needs nothing else installed. Fixtures are **deterministic**. They come from the spec's own `example` when it validates against the schema, and otherwise from the field's type, format and constraints. A fixture that changed between runs would make every snapshot test flaky, so none do.

Routes are anchored at the client's base URL and matched most-specific first, so `/users/me` is never answered by `/users/{id}`. An error status with no body of its own replies with the operation's declared error fixture, so your error-handling branch gets a schema-valid body.

## Fake data that passes its own schema

```ts
import { seedFaker, createBook } from './gen/dev'

seedFaker(42)                                   // reproducible across runs
const book = createBook()
const lost = createBook({ status: 'lost' })
const shelf = Array.from({ length: 20 }, () => createBook())
```

The rule: a factory must produce data its own schema accepts. The generator handles the constraints that make naive faker output invalid:

| the spec states | the factory emits |
| --- | --- |
| nothing | a guess from the field name (`email` → `faker.internet.email()`) |
| `maxLength` only | the same, sliced to the maximum |
| a real `minLength` | `faker.string.alpha({ length: … })` |
| `pattern` | `faker.helpers.fromRegExp(…)` |
| `enum` | `faker.helpers.arrayElement([…])` |
| a `format` | that format's generator, never sliced (a sliced uuid is not a uuid) |

Recursive models terminate, because depth is passed through the builders explicitly. You need `@faker-js/faker` installed in the consuming project.

## The multiplatform target

`target: 'multiplatform'` adds the `*.native.tsx` files, and this is where lathe parts ways with every other generator. Pyreon's native compiler (PMTC) compiles one file at a time and has no module graph, so an endpoint in `endpoints/books.ts` that imports a client from `client.ts` resolves against nothing on iOS or Android. No person would maintain one big self-contained file per feature. A generator has no reason not to. So the native target emits one self-contained module per tag:

```ts
// src/gen/books.native.tsx (generated, abridged)
const api = createHttp({ baseUrl: 'http://localhost:5199/v1', schema: standardSchema })

export const Book = s.object({
  id: s.string().uuid(),
  title: s.string().min(1),
  status: s.string(),
  /* … */
})

export const getBook = api.endpoint('GET /books/:bookId', { response: Book })

export function GetBookData(props: { bookId: string; children: (data: Book | undefined) => unknown }) {
  const q = useQuery<Book>(() => getBook.query({ params: { bookId: props.bookId } }))
  return () => props.children(q.data())
}
```

Note `status: s.string()`. On the native path an `enum` narrows to its base scalar, and lathe documents that loss in its limits table instead of hiding it.

Then lathe **runs the real compiler over its own output** and looks for positive proof that it lowered, such as `PyreonQuery<` in the result. Zero warnings is not accepted as evidence: a hand-written hook wrapping `useQuery` can compile without a single warning and still emit Swift that references a symbol that does not exist. Here is the end of `lathe check` on the bookshelf example:

```text
  native reach  3/4 operations
    web-only 1 op(s): createBook
      `POST` lowers through mutations, which PMTC does not yet recognise; GET operations on this client DO reach native.

  lowers authors.native.tsx swift  [PyreonQuery< PyreonZodSchema_ PyreonSchemaError]  compiled
  lowers authors.native.tsx kotlin  [PyreonQuery< PyreonZodSchema_ PyreonSchemaError]  compiled
  lowers books.native.tsx swift  [PyreonQuery< PyreonZodSchema_ PyreonSchemaError]  compiled
  lowers books.native.tsx kotlin  [PyreonQuery< PyreonZodSchema_ PyreonSchemaError]  compiled
  all modules together swift  compiled
  all modules together kotlin  compiled
```

Three of four operations reach native, and the fourth is named with the reason. The Swift side of `ListBooksData` comes out as a real SwiftUI view holding a query:

```swift
struct ListBooksData: View {
  @State private var q = PyreonQuery<[Book]>(
    queryKey: "GET:https://books.test/v1/books", staleSeconds: 0)
  …
}
```

(This sample is from the lathe README, generated against a spec whose base URL is `https://books.test/v1`.) If the native compiler is not installed, the check says it skipped instead of quietly passing. For how PMTC lowers a component in general, see [Your TypeScript, compiled to SwiftUI and Jetpack Compose](/blog/how-pmtc-turns-tsx-into-swiftui-and-compose).

In CI:

```bash
lathe check --strict-native --fail-on-breaking
```

`--strict-native` fails when a native module does not lower. `--fail-on-breaking` fails when a spec change would break the generated client's public contract, such as a removed field or a narrowed type. `lathe diff <before> <after>` renders that contract change for a pull request, and each side can be a git revision (`main:openapi.yaml`).

> **The same spec that types your web client compiles to Swift and Kotlin.**

## Every loss gets a name

Every part of the spec the client does not honour becomes a **note** with a stable code, a JSON pointer into the spec and a severity: `loss` (the spec says something the client does not do) or `choice` (lathe picked one of several equivalent readings). A few losses you will meet: `response-headers` (response headers are not exposed), `other-success-responses` (only the first 2xx is typed), `int64-precision` (`format: int64` as `number` rounds past 2^53 − 1; set `int64: 'bigint'`) and `no-servers` (no absolute base URL, so nothing reaches native). The notes appear in the terminal, under `--json`, and in the generated reference pages. Read them first on your own spec: they show what your API describes that no generated client would honour.

## Where lathe stops today

- **Mutations stay on the web.** PMTC recognises queries, not mutations, so a `POST` operation is reported `web-only` with that reason (you saw it above).
- **A relative `baseUrl` makes every operation web-only**, because PMTC bakes the request URL in at compile time. That is why the example's `baseUrl` is absolute.
- **Only the `pyreon` client reaches native.** `client: 'fetch' | 'axios' | 'ky'` is web-only, and combining one with `target: 'multiplatform'` is refused at config time rather than silently downgraded.
- **Native narrows some shapes.** `enum`/`const` narrow to their base scalar, `date`/`date-time` stay strings on both paths, a field that names another model is dropped under the default validator (it lowers under `validator: 'zod'`, which inlines the reference), and a `$ref` cycle drops that one field.
- **`faker`, the preview components and `int64: 'bigint'` are web-only.**
- **Response headers are not generated**, and a non-JSON error body stays untyped.
- **Streams reach native only in one shape.** An SSE or NDJSON operation gets `<op>Stream` and `use<Op>Stream` on the web; on native, a stream-only operation with a typed event gets a stream component that lowers to the native `PyreonStream` runtime.
- **The generated data components need a native compiler with render-prop support.** Against an older compiler, the verifier reports them `BROKEN` instead of claiming they lower.
- **Swagger 1.x is refused.** OpenAPI 3.0, 3.1 and Swagger 2.0 (up-converted) are supported.

## Build something with it

```bash
npm create @pyreon/zero@latest
```

Then add lathe, point `lathe init` at the spec you already have, and read the loss notes before anything else.

- Docs: [lathe, every option and plugin](/docs/lathe)
- Star the repo: [github.com/pyreon/pyreon](https://github.com/pyreon/pyreon)
- Talk to us on [Discord](https://pyreon.dev/discord) or open an issue on [GitHub](https://github.com/pyreon/pyreon/issues).
