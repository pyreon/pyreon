---
title: Lathe
description: OpenAPI in, typed Pyreon client out — schemas, endpoints, query hooks, mocks, fake-data factories, reference pages and Atlas scenarios, with a multiplatform mode that proves its own output lowers to Swift and Kotlin.
---

`@pyreon/lathe` reads an OpenAPI 3.x document and emits a client for the Pyreon
stack. Not a fetch wrapper — the whole surface: `@pyreon/validate` schemas,
`@pyreon/http` endpoint declarations, `@pyreon/query` hooks, query keys derived
from those endpoints, deterministic mock fixtures, fake-data factories, Markdown
reference pages, and `@pyreon/atlas` scenarios.

<PackageBadge name="@pyreon/lathe" href="/docs/lathe" />

## Installation

```bash
pyreon add @pyreon/lathe
```

## Quick start

```ts
// pyreon.config.ts
export default {
  lathe: {
    input: './openapi.yaml',
    output: './src/gen',
  },
}
```

```bash
lathe generate
```

```ts
import { keys, useListBooks, type Book } from './gen'

function Books() {
  const query = useListBooks()
  return <For each={() => query.data() ?? []}>{(b) => <li>{b.title}</li>}</For>
}
```

## What separates it from a conventional generator

### It proves its own output lowers to native

`target: 'multiplatform'` is the part with no analogue elsewhere.

Pyreon's native compiler (PMTC) has **no module graph** — `transform()` takes one
file and its recognisers only ever see that file's top level. So a client in
`client.ts` and an endpoint in `endpoints/books.ts` are two unrelated files to
it: the endpoint resolves against nothing and the call stays web.

A human would never accept one giant file per feature. **Generated code has no
such objection**, so the native target emits one self-contained module per tag —
client, schemas, endpoints and calls sharing a single top level — which is
exactly the shape the compiler wants.

Then it runs the **real compiler** over its own output and checks for the
positive marker (`PyreonQuery<`, `PyreonZodSchema_`), because zero warnings is
not evidence of lowering: a standalone hook wrapping `useQuery` produces no
warnings and emits Swift referencing a symbol that does not exist.

```swift
struct ListBooksData: View {
  @State private var q = PyreonQuery<[Book]>(
    queryKey: "GET:https://books.test/v1/books", staleSeconds: 0)
  …
}
```

A `does NOT compile` warning is treated as broken rather than advisory, and an
absent compiler **skips loudly** instead of passing.

### Losses are reported once, at the boundary

A spec can express a great deal no target here can represent. Every reduction
becomes a `note` with a stable code and a JSON-pointer location, so a loss is
reported once instead of rediscovered by six emitters — and it lands in the
generated reference pages, not only in the terminal.

### The spec parser is first-party

Including a YAML reader scoped to the OpenAPI subset, which **refuses** anchors,
merge keys, explicit tags and tab indentation with a line number rather than
mis-reading them. There is no third-party spec dependency to trust.

## Entry points mirror the dependency graph

A generator produces an import **graph**, and the entry points are where that
graph becomes visible to a bundler.

```
gen/index.ts            production — schemas, client, endpoints, queries, keys
gen/dev.ts              fixtures and faker factories (node-safe, no JSX)
gen/endpoints/index.ts  every call, no hooks   (loaders, scripts, server code)
gen/queries/index.ts    every hook, no previews
gen/queries/books.ts    one tag — Vite emits one chunk per tag file
gen/package.json        the sideEffects marker
```

### A page can never reach a dev surface

Fixtures, fake-data factories and preview components are **not** re-exported
from `index.ts`. This is the same shape as `@pyreon/server/client` in this repo:
nothing in `dev.ts` is unsafe to import, it is unsafe to import *by accident*.

```ts
import { useListBooks } from './gen'       // no faker, no fixtures, ever
import { seedFaker, installMocks } from './gen/dev'  // tests, workbenches
import { ListBooksPreview } from './gen/components'  // stories, Atlas
```

`dev.ts` is **node-safe**: the JSX previews are not in it, so a plain node test
that wants one fake object does not have to configure a JSX transform for
components it never touches.

The isolation is **structural**, not a bundler setting. The `sideEffects` marker
below is a hint a bundler may ignore, so the guarantee does not rest on it:
`index.ts` simply does not *name* `./faker`, `./mocks` or `./components`, so
there is no edge for any bundler to follow. A 24-case matrix (every production
entry × every dev surface, with **and without** the marker) asserts it by
bundling for real.

### Why the emitted `package.json` matters

A bundler keeps a module-level **call** unless it can prove the call is pure,
and `api.endpoint('GET /books', …)` and `s.object({ … })` are both module-level
calls. Measured with Vite 8 on a 30-tag / 120-operation spec, importing **one**
hook:

| | raw | gzip | endpoints kept | fixtures kept |
| --- | ---: | ---: | ---: | ---: |
| flat barrel, no marker | 30,710 B | 2,420 B | 120 | 120 |
| layered entries, no marker | 10,400 B | 1,681 B | 116 | 0 |
| layered entries + marker | **5,748 B** | **642 B** | **4** | 0 |

Two honest notes. The **marker** is what closes the size gap — the layering
removes the fixtures, not the endpoints. And an app whose own `package.json`
already declares `sideEffects: false` was never affected, because its
declaration covered the generated files too; emitting the marker means the
outcome no longer depends on a field in a file the generator did not write.

`/* @__PURE__ */` per declaration is the reflex and is nearly useless here —
measured 2,041 B → 2,000 B, 2% — because the arguments are themselves calls
(`s.string().uuid()`) the bundler must still evaluate.

The declaration is an **array** naming `atlas.wrapper.tsx` whenever `atlas` is
selected, because that file really does call `installMocks()` at module scope.
`false` would be a lie, and a bundler would act on it.

## Plugins

`plugins` is the whole emitter set; omit one and it does not run. Schemas alone
is a normal thing to want.

| plugin | emits | needs |
| --- | --- | --- |
| `types` | plain TypeScript types, no runtime | — |
| `schemas` | `@pyreon/validate` schemas + inferred types | — |
| `client` | the client + one endpoint per operation | `schemas` |
| `queries` | `useQuery` / `useMutation` hooks + `keys.ts` | `client` |
| `mocks` | route table for the mock middleware | `client` |
| `faker` | one `createX(overrides?)` factory per model | `schemas` |
| `components` | one browsable preview per read operation | `queries` |
| `atlas` | workbench scenarios + wrapper | `components`, `mocks` |
| `docs` | Markdown reference pages | — |

The **needs** column is import edges in the emitted code, not preferences. A
selection is expanded to cover them rather than refused, and the report says
what came along:

```
plugins: components (+schemas, +client, +queries - required by them)
```

```bash
lathe generate --plugins schemas          # just schemas + types
lathe generate --plugins schemas,mocks    # ...and deterministic fixtures
lathe generate --plugins docs             # just the Markdown reference
```

## The HTTP client is selectable

```ts
lathe: { input: './openapi.yaml', client: 'axios' }
```

`pyreon` (default) · `fetch` · `axios` · `ky`. Every generated file except
`client.ts`, `mocks.ts` and `dev.ts` is **byte-identical** whichever you pick,
because they all satisfy the same endpoint seam — asserted by test, not assumed.

The URL is resolved by the generated code and handed to the transport
fully-formed, so the instance carries no `baseURL` / `prefixUrl`. That is not
tidiness: axios and ky each resolve a base differently from the other and from
`@pyreon/http`, and letting them do it would make the same spec issue a
different request depending on one config word.

One thing is deliberately **not** normalised — ky retries a 5xx GET twice. That
is its own documented default, and someone who picked ky picked it.

`target: 'multiplatform'` with a non-Pyreon client is **refused**, not silently
downgraded: PMTC lowers `createHttp` by name, so native modules over axios would
lower to nothing — precisely the regression that target exists to catch.

## The schema library is selectable too

```ts
lathe: { input: './openapi.yaml', validator: 'zod' }
```

Both satisfy Standard Schema, so the endpoint layer accepts either. Both reach
native, through different doors and with **different coverage** — measured
against the real compiler:

| shape | `s.*` | zod |
| --- | --- | --- |
| scalars, optional, nullable, arrays of scalars | lowers | lowers |
| a **nested object** | dropped | **lowers** |
| an **array of objects** | dropped | **lowers** |

That is the opposite of what you would assume from `@pyreon/validate` being
first-party, and it is why `validator: 'zod'` is not merely an interoperability
option. Under zod, refs are **inlined** on the native path — and an inlined ref
is a nested object, which lowers.

## Fake data that stays valid

```ts
import { seedFaker, createBook } from './gen/dev'

seedFaker(42)                        // reproducible across runs
const book = createBook()
const lost = createBook({ status: 'lost' })
const many = Array.from({ length: 20 }, () => createBook())
```

The rule: a factory must produce data its **own schema accepts**. Applied
bluntly that makes every constrained field gibberish, which defeats the point of
reaching for faker at all — so the line sits where a realistic generator stops
being able to *promise* something, which is a lower bound:

| the spec states | the factory emits |
| --- | --- |
| nothing | the field-name guess — `email` → `faker.internet.email()` |
| `maxLength` only | the same, `.slice(0, max)` — satisfiable, still readable |
| a real `minLength` | `faker.string.alpha({ length: … })` |
| `pattern` | `faker.helpers.fromRegExp(…)`, anchors stripped |
| `enum` | `faker.helpers.arrayElement([…] as const)` |
| a `format` | the format's generator, unclamped — slicing a uuid breaks it |

`maxLength` with no `minLength` is the common shape in a real document, so the
middle row is most of what you get. Recursive models terminate: depth is
threaded through the builders explicitly rather than kept in module state.

Requires `@faker-js/faker` in the consuming project.

## Mocks

```ts
import { installMocks } from './gen/dev'

installMocks()   // every request answered from the fixtures, no server
```

Kubb reaches for MSW here. Pyreon does not need to: `@pyreon/http` ships
`mock()` as middleware on the client itself, so a generated mock is an array of
routes rather than a service worker, works identically in Node and the browser,
and needs no separate install.

Fixtures are **deterministic** — derived from the spec's own `example` where it
has one and from the field's type and format where it does not. A mock that
changed shape between runs would turn every snapshot test into a flake.

## Reference pages

```ts
lathe: { input: './openapi.yaml', plugins: ['schemas', 'client', 'queries', 'docs'] }
```

```
gen/docs/index.md     tags, reach summary, and everything the spec expressed
                      that the client does not
gen/docs/books.md     per operation: contract, params, the generated hook
gen/docs/models.md    the emitted types
```

Markdown with frontmatter, so the pages drop into a `@pyreon/zero-content`
collection unchanged and still read on GitHub with nothing installed.

Kubb reaches for Redoc here, which renders the **spec**. That is a different
document: it tells you the HTTP contract and leaves you to work out which
generated hook corresponds to `GET /books/{bookId}` and whether it works on iOS.
Those are properties of the **generated code**, so these pages document that,
with the contract beside it — including the one column a rendering of the spec
cannot produce:

````md
## `getBook`

`GET /books/:bookId`

- **Reach** — web · iOS · Android
- **Response** — `Book`

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `bookId` | path | yes | `string` |

```ts
import { useGetBook } from './gen/queries/books'

const query = useGetBook(() => ({ params: { bookId: '…' } }))
```
````

The reach column comes from the same analysis the CLI prints, so a page and a
terminal cannot disagree about whether an operation runs on a phone.

## Query keys come from the endpoints

```ts
const client = useQueryClient()
create.mutate({ json }, {
  onSuccess: () => client.invalidateQueries({ queryKey: keys.books.listBooks.all }),
})
```

A hand-written `['GET', '/books']` drifts from the endpoint the moment a path
changes and nothing catches it. `.all` matches every call of an endpoint;
`.of(args)` matches one.

## The workbench, generated

`plugins: ['atlas']` emits three files that line up with each other:
`components.tsx` (one browsable preview per read operation, whose variant axis
is the data state — a real prop, so Atlas infers a control),
`atlas.scenarios.ts` (keyed to those exact component names), and
`atlas.wrapper.tsx` (a `QueryClientProvider` with the generated mocks
installed, so every card renders with no server).

Every preview gets the three states a live request will not produce on demand —
loading, error, empty — which are the three a UI most often gets wrong.

## Automation

### The Vite plugin

```ts
import lathe from '@pyreon/lathe/vite'

export default defineConfig({
  plugins: [lathe({ input: './openapi.yaml', checkOnBuild: true }), pyreon()],
})
```

Regenerates on dev-server start and whenever a spec changes. `checkOnBuild`
turns a stale client into a **build error** rather than a warning.

:::tip
Read the settings from `pyreon.config.ts` rather than repeating them here —
`lathe({ ...config.lathe, checkOnBuild: true })`. Two copies drift the moment a
plugin is added to one, and the build then fails its own freshness check against
output the CLI has just declared current.
:::

### `lathe check` in CI

```bash
lathe check    # regenerates in memory, diffs, exits non-zero on drift
```

Generated code that has drifted from its spec is a lie the compiler cannot
catch: the stale client typechecks perfectly against itself and the mismatch
surfaces as a runtime 404 far from the edit.

### Several specs, one pass

```ts
lathe: {
  target: 'multiplatform',
  plugins: ['schemas', 'client', 'queries'],
  projects: [
    { name: 'books', input: './specs/books.yaml', output: '../books-client/src/gen' },
    { name: 'billing', input: './specs/billing.yaml', output: '../billing-client/src/gen' },
  ],
}
```

`target` and `plugins` are written once and overridable per project. `lathe
check` covers them all.

## Calling the API

### Every call site is typed from the spec

Each endpoint is declared with its input type, so a DIRECT call — a loader, a
server route, a script — is as strict as a hook:

```ts
import { addPet, findPetsByStatus, getPetById } from './gen/endpoints/pet'

await getPetById({ params: { petId: 1 } })
await findPetsByStatus({ query: { status: 'sold', limit: maybeLimit } }) // limit?: number | undefined
await addPet({ json: { name: 'Rex', photoUrls: [] } })

getPetById({ params: { petId: 'x' } })          // ✗ petId is an integer
findPetsByStatus({ query: { status: 'nope' } })  // ✗ not a value of the enum
addPet()                                         // ✗ the body is required
```

Required exactly where the spec says (`requestBody.required` defaults to
**false** in OpenAPI, so an unmarked body is optional), and
`exactOptionalPropertyTypes`-correct, so a signal-derived value that might be
`undefined` passes. An operation that sends nothing accepts no query or body at
all. A body on `GET`/`HEAD` — which `fetch` refuses to send — is dropped with a
`body-on-get` note.

The hooks DERIVE their types from the endpoint (`Parameters<typeof op>[0]`,
`Awaited<ReturnType<typeof op>>`) rather than re-rendering the spec, so a hook
and a direct call can never disagree about a type.

### Hook options are typed, and `select` changes the result

```ts
const pet = useGetPetById(() => ({ params: { petId: id() } }), () => ({ staleTime: 60_000 }))
const count = useFindPetsByStatus(() => ({}), () => ({ select: (pets) => pets.length }))
count.data() // number | undefined
```

A typo in an option is a compile error. Return `undefined` from the args
accessor while the arguments are not ready — the query is disabled rather than
fired with a placeholder.

### Mutations invalidate what they change

```ts
const add = useAddPet({ onSuccess: (pet) => toast(`Added ${pet.name}`) })
add.mutate({ json: { name: 'Rex', photoUrls: [] } })
```

By default a mutation invalidates every query at or below the collection it
changes — `DELETE /pets/{id}` refetches `GET /pets`, `GET /pets/{id}` and
`GET /pets/findByStatus`. Pass `invalidates` to replace the list, or `[]` to
turn it off. For optimistic updates, `keys.ts` exports a helper typed from the
endpoint that returns a rollback:

```ts
import { optimisticUpdate } from './gen'

const rename = useUpdatePet({
  onMutate: async (vars) => ({
    rollback: await optimisticUpdate(client, getPetById, getPetById.key.prefix, (pet) =>
      pet && { ...pet, name: vars.json.name }),
  }),
  onError: (_e, _v, ctx) => ctx?.rollback(),
})
```

### Configure the client at runtime

```ts
import { auth, configureApi } from './gen'

configureApi({
  baseUrl: import.meta.env.VITE_API_URL,               // an environment switch
  headers: () => ({ 'x-request-id': crypto.randomUUID() }),
  use: [auth.petstoreAuth(() => session.token()), logger],
  validate: import.meta.env.PROD ? 'warn' : 'strict',
})
```

Every field is its own slot, read per request — endpoints bind to the client
when they are declared, so nothing that varies is baked in. `installMocks()`
answers through a SEPARATE slot, so it never removes your auth middleware. A
key present with `undefined` resets that slot to its generated default.

`auth` has one typed helper per `components.securitySchemes` entry: bearer
(also OAuth2 / OpenID Connect, which reach the client as a bearer token), basic
(UTF-8 safe), and API keys in a header, a query parameter or a cookie (the
cookie form applies on the server — browsers forbid setting `Cookie`). A
credential may be an accessor, re-read on every request.

`validate` also has a config default — `lathe: { validate: 'warn' }` — for a
backend that drifts: `'warn'` logs a mismatch and passes the body through,
`'off'` skips validation (safe only for non-transforming schemas).

The `fetch` / `axios` / `ky` clients export the same `configureApi` minus `use`;
interceptors belong on their exported `instance`.

### Serialization the spec states

- **Query `style` / `explode`** — CSV (`form`, `explode: false`), space- and
  pipe-delimited arrays, `deepObject` and exploded `form` objects are declared
  on the endpoint (`queryStyle`), so the wire matches the spec on every client.
- **Non-JSON responses** decode by media type: `text/*` and XML as a string,
  `text/event-stream` / NDJSON as a `ReadableStream`, everything else (PDFs,
  images, octet-stream) as a `Blob` — typed accordingly.
- **Custom verbs** — a literal `:` in a path (`/v1/{name}:cancel`) is escaped,
  so it is not read as a second parameter.
- **Cache keys** are namespaced per generated client (the project name, else
  the API's base URL), so two generated clients can share one `QueryClient`.

### Mocks for tests

Every fixture satisfies its own generated schema — values are chosen
constraints-first (enum, pattern, length, range) and a spec `example` is used
only when it conforms. Routes are anchored at the client's base URL and matched
most-specific first, so `GET /pets?limit=5` is intercepted and `GET /users/me`
is not answered by `/users/{id}`.

```ts
import { installMocks, mockCalls, mockOperation, resetMocks } from './gen/dev'

beforeEach(installMocks)
afterEach(resetMocks)

it('shows the empty state', async () => {
  mockOperation('findPetsByStatus', { json: [] })
  // …
})
it('shows the error state', async () => {
  mockOperation('getPetById', { status: 500, json: { message: 'down' }, delay: 50 })
})
```

### Not generated (yet): infinite queries

Pagination is not detected. Doing it properly needs two facts a spec does not
state in a standard way — WHICH parameter advances the page and WHERE the next
value is in the response (a `next_cursor` field, the last item's id for
Stripe's `starting_after`, a full `next` URL for Spotify, a `Link` header for
GitHub). A name heuristic would guess wrong on a large share of real APIs and a
wrong `getNextPageParam` loops or stops silently. The intended design is
explicit: an `x-pagination` spec extension or a per-operation config entry
naming the parameter and the response path, emitting a `use<Op>Infinite` hook
over `useInfiniteQuery`. Until then, call the endpoint from your own
`useInfiniteQuery` — its input type makes that fully typed.

## Honest limits

- **Mutations are web-only on the native target.** PMTC recognises queries, not
  mutations, so a `POST` operation is reported `web-only` with that reason.
- **A relative `baseUrl` makes every operation web-only** — PMTC bakes the
  request URL at compile time.
- **The generated data components compile on Kotlin but not on Swift.** They
  are render-prop components and PMTC does not support render props yet. The
  verifier compiles each module when `swiftc` / `kotlinc` are installed and
  reports this `BROKEN` rather than claiming it lowers.
- A verdict of **`partial`** means the module lowers but PMTC dropped part of
  a model (a field it cannot represent); the report names the declaration.
- **No multi-project composition.** `projects: [...]` writes N independent
  output trees; there is no combined entry across them.
- **`faker` does not reach native**, and neither do the preview components.
- A `$ref` **cycle** has no finite nesting, so the native schema names the
  target and the compiler drops that one field with a warning.

## Example

[`examples/lathe-bookshelf`](https://github.com/pyreon/pyreon/tree/main/examples/lathe-bookshelf)
generates the whole surface — schemas, client, hooks, keys, mocks, faker, Atlas
scenarios, reference pages and the two native modules — from a 4-operation spec,
and serves the API it talks to as in-process dev middleware so the e2e boots one
thing and still exercises real HTTP.
