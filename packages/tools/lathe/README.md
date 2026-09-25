# @pyreon/lathe

Spec-to-client code generation for the Pyreon stack. Reads an OpenAPI 3.x
document; emits `@pyreon/validate` schemas, `@pyreon/http` endpoints,
`@pyreon/query` hooks, mock fixtures and `@pyreon/atlas` scenarios.

```bash
bun add -d @pyreon/lathe        # or: pyreon add @pyreon/lathe
npx lathe init                  # set up pyreon.config.ts, scripts, first generate
```

`lathe init` detects what the project generates from today — an orval,
`@hey-api/openapi-ts` or kubb config, an `openapi-typescript` script, or a bare
`openapi.*` file — writes a `lathe` section into `pyreon.config.ts` (creating
it, or adding one entry; an existing `lathe` section is never replaced), maps
every option it can and names every one it cannot with what to do instead,
adds `lathe:generate` / `lathe:check` scripts, prints the install command and
runs the first generate. The other generators' configs are read as text,
never executed. `--yes` for CI, `--dry-run` to preview, `--from <tool>` to skip
detection. Migration guides:
[orval](https://pyreon.dev/docs/lathe-from-orval) ·
[hey-api](https://pyreon.dev/docs/lathe-from-hey-api) ·
[kubb](https://pyreon.dev/docs/lathe-from-kubb) ·
[openapi-fetch](https://pyreon.dev/docs/lathe-from-openapi-fetch).

OpenAPI 3.0 and 3.1. A Swagger 2 document is refused with the conversion
command (`npx swagger2openapi`), and a file that is not a spec at all is refused
before anything is written. `@pyreon/native-compiler` is an optional peer (it
verifies `target: 'multiplatform'` output); `@faker-js/faker` is needed only for
the `faker` plugin, `zod` only for `validator: 'zod'`.

## What makes it different

Most generators emit code and hope. Lathe's `multiplatform` target emits code
that the native compiler can lower to Swift and Kotlin, and then **runs that
compiler over its own output to check**.

That is possible for generated code and not for hand-written code, for a
specific reason: PMTC has no module graph. `transform()` takes one file's
source and returns one file's output, and its recognizers only ever see the top
level of the file in front of them. A `createHttp` client in `client.ts` and an
`api.endpoint(...)` in `endpoints/books.ts` are, to the native compiler, two
unrelated files — the endpoint resolves against nothing and the call stays web.

A human would not maintain one giant file per feature. Generated code has no
opinion, so the native layout is exactly that:

```
web target                    multiplatform target (additive)
  schemas/Book.ts               books.native.tsx   <- client + schemas +
  client.ts                                           endpoints + calls,
  endpoints/books.ts                                  one top level
  queries/books.ts
```

Which produces, through the real compiler:

```swift
struct ListBooksData: View {
  @State private var q = PyreonQuery<[Book]>(
    queryKey: "GET:https://books.test/v1/books", staleSeconds: 0)
  var body: some View {
    ZStack { children(q.data) }
      .task {
        if q.isStale {
          q.begin()
          do {
            let (bytes, _) = try await URLSession.shared.data(
              from: URL(string: "https://books.test/v1/books")!)
            q.resolve(try JSONDecoder().decode([Book].self, from: bytes))
          } catch { q.reject(error) }
        }
      }
  }
}
```

## Verification is positive, not the absence of complaint

`warnings.length === 0` is **not** evidence of lowering. A standalone hook
wrapping `useQuery` produces zero warnings and emits Swift referencing a symbol
that does not exist on the target — the build fails much later, at `swiftc`.

So the verifier asserts the marker (`PyreonQuery<`, `PyreonZodSchema_`) and the
absence of leaked web-only symbols, treats a `does NOT compile` warning as
broken rather than advisory, and reports a missing compiler as **skipped**
rather than passing.

## Automation

### The Vite plugin

```ts
// vite.config.ts
import lathe from '@pyreon/lathe/vite'

export default defineConfig({
  plugins: [lathe({ checkOnBuild: true }), pyreon()],
})
```

Reads the `lathe` section of `pyreon.config.ts` itself (found and resolved
exactly as the CLI does); options passed to `lathe()` win per key. Generates
once at dev-server start and again whenever a spec or the config changes, and
logs what moved — breaking contract changes by name, spec features not
represented, files written and removed. A missing spec is a warning with a
did-you-mean rather than silence. `checkOnBuild`
turns a stale client into a **build error** rather than a warning — generated
output that disagrees with its spec compiles and then fails against the real
server, which is the worst place to find out.

It writes files to disk rather than serving a virtual module, deliberately: the
one artifact people need to read when something looks wrong should be the one
they can open.

### Watch mode

```bash
lathe generate --watch
```

Watches the spec(s) **and the config** (an edited config is re-read). Each
watch is on the containing directory with a filename filter rather than the file
itself — editors write via rename as often as in place, and a watch on the
inode dies the first time one replaces it. Events are coalesced, and a spec
that is unparseable mid-save prints the error and keeps watching rather than
exiting.

### `lathe check` in CI

Regenerates in memory and fails if committed output has drifted — the same
contract as `gen-docs --check`, covering every project.

## Entry points mirror the dependency graph

```ts
import { keys, useCreateBook, useListBooks, type Book } from './gen'
```

The per-tag split is the generator's business. Nothing in your app needs to
know which tag an operation was filed under, or that tags exist.

But a barrel is a REACHABILITY edge, and treating it as pure convenience has a
cost you pay in the bundle. So the output is layered:

```
gen/index.ts            production — schemas, client, endpoints, queries, keys
gen/dev.ts              fixtures and faker factories (node-safe, no JSX)
gen/endpoints/index.ts  every call, no hooks   (loaders, scripts, server code)
gen/queries/index.ts    every hook, no previews
gen/queries/books.ts    one tag — Vite emits one chunk per tag file
gen/schemas.ts          re-exports every schema module
gen/schemas/Book.ts     one module per model (a `$ref` cycle shares one)
gen/package.json        `sideEffects`, so all of the above tree-shakes
```

An operation the spec does not tag is grouped by its first static path segment
after the prefix every untagged path shares — `/v1/customers/{id}` lands in
`customers` — rather than in one catch-all `default` module. Stripe's spec tags
nothing, and the catch-all was one 147 KB endpoint module of 612 endpoints; it is
79 modules now. A path group whose file name matches a real tag joins that tag.
An operation explicitly tagged `default` is grouped by path too: the IR cannot
tell it apart from an untagged one.

`dev.ts` is the same shape as `@pyreon/server/client` in this repo: nothing in
it is unsafe to import, it is unsafe to import *by accident*.

It is also **node-safe**, which is why the preview components are not in it.
They are JSX, so re-exporting them made the whole dev entry require a JSX
transform — a plain node test that wanted one fake object had to configure one,
for components it never touches. Previews have exactly one kind of consumer (an
Atlas config, a story) and that consumer imports `./components` directly. Found
by consuming the output from a test in the example, which is the only place that
question comes up. A fixture table is
DATA, so unlike an unused function it survives minification wherever it is
reachable — a barrel that named it put every fixture in the page bundle.

**A page can never reach a dev surface, whatever the bundler does.** The
`sideEffects` marker below is a *hint*: it makes the output shake, and a bundler
is free to ignore it. So the isolation does not rest on it — `index.ts` simply
does not NAME `./faker`, `./mocks` or `./components`, so there is no edge for
any bundler to follow. Importing a hook cannot pull in faker even if the marker
is deleted, and a 24-case matrix (every production entry × every dev surface,
with and without the marker) asserts it by bundling for real and grepping the
output.

The markers it greps for are external import specifiers and string data, never
generated identifiers — an identifier minifies to a single letter, so an
assertion against one would pass with the whole module bundled. A control that
bundles `dev.ts` itself and requires every marker to be PRESENT is what caught
that.

### A hook's bundle is what the hook uses

A bundler keeps a module-level CALL unless it can prove the call is pure, and
`api.endpoint('GET /books', …)` and `s.object({ … })` are both module-level
calls. Two things make one hook cost what it uses, and both are needed:

- **One schema module per model.** A hook imports its response model; its tag's
  endpoint module imports each model its endpoints name, from that model's own
  module. A `$ref` cycle shares ONE module: split across two ES modules it is
  an import cycle, and which side evaluates first depends on who imported
  first.
- **`/* @__PURE__ */` on every emitted call** — every `s.*(…)` builder,
  arguments included, a chain on a bare model name (`Author.optional()`), and
  every `api.endpoint(…)`. So an unused declaration inside a module that IS
  reached is dropped too.

Measured with Vite 8.2.2, one hook, minified and gzipped ("generated" externalises
`@pyreon/*`, "+ runtime" bundles it):

| GitHub, `useIssuesGet` | generated | + runtime |
| --- | ---: | ---: |
| before | 94.4 KB | 121.1 KB |
| pure annotations only | 10.5 KB | 37.3 KB |
| per-model modules only | 5.2 KB | 31.7 KB |
| **both** | **2.8 KB** | **29.2 KB** |

| Stripe, `useGetCustomersCustomer` | generated | + runtime |
| --- | ---: | ---: |
| before | 70.8 KB | 97.7 KB |
| pure annotations only | 61.1 KB | 87.8 KB |
| per-model modules only | 69.2 KB | 96.0 KB |
| **both** | **42.8 KB** | **69.7 KB** |

Stripe stays large for a real reason: `Customer` reaches 928 of its 1,537
models, through a 97-model `$ref` cycle, and validating a `Customer` needs them.
Importing the hook through the root `./gen` costs the same as through its tag.

An earlier version of this page said `/* @__PURE__ */` was "nearly useless —
2%". That measured the annotation on the OUTER declaration only, with every
argument still a call the bundler had to keep; annotated throughout, it is the
larger of the two levers.

The emitted `package.json` is the third piece. It declares the output
side-effect-free (an ARRAY naming `atlas.wrapper.tsx` when `atlas` is selected,
because that file really does call `installMocks()` at module scope), so an
unreached module is dropped whole and the result no longer depends on a field in
the app's own `package.json`. Without it, `keys.ts` — whose `op.key.prefix`
reads a bundler must assume may run a getter — keeps every endpoint it names.

### Model types are written out, not inferred

```ts
// gen/schemas/Book.ts
export interface Book { id: string; title: string; pages?: number | undefined }
export const Book = /* @__PURE__ */ s.object({ … }) as unknown as Schema<Book>
```

The inferred form (`export type Book = Infer<typeof Book>`) made every
consumer's TypeScript re-derive every model from the builder types of the whole
spec. tsc 6.0.3 over the generated schemas + client + queries, instantiations
(deterministic):

| | inferred | written out |
| --- | ---: | ---: |
| Stripe, `@pyreon/validate` | 1,372,857 | 580,009 |
| Stripe, zod | 1,043,674 | 364,887 |
| GitHub, `@pyreon/validate` | 1,947,953 | 1,483,741 |

Annotating the const instead (`const Book: Schema<Book> = …`) was measured and
is WORSE than inferring — it keeps the initializer's type and adds an
assignability check. `as unknown as` is the form that relates nothing, so the
agreement between each interface and its schema is enforced by lathe's own
tests instead, in both directions, for every model.

The trade: a generated schema is typed `Schema<Book>` (`z.ZodType<Book>` under
zod), so `.parse`, `.optional()`, `.nullable()`, `.array()` and Standard Schema
all work, but object-only builders such as `.extend` or `.pick` do not
type-check on it. Compose a new schema around it instead.

### Query keys come from the endpoints

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

| file | what it is |
| --- | --- |
| `components.tsx` | one preview per safe read, rendered by response shape |
| `atlas.scenarios.ts` | `Default` / `Data` / `Loading` / `Error` / `Empty` per preview |
| `atlas.wrapper.tsx` | the `QueryClientProvider`, with mocks installed |

```ts
// atlas.config.ts — names no component, no scenario, no provider
import { scenarios } from './src/gen/atlas.scenarios'
import { wrapper } from './src/gen/atlas.wrapper'

export default { title: 'Bookshelf', scenarios, wrapper, ignore: ['.native.tsx'] }
```

```
atlas verify: 3 component(s), 15 scenario(s) — 0 failing
atlas verify-browser: 15 scenario(s) — coverage measured on 15, 0 visual diff(s)
```

**Which reads.** Every `GET` with a JSON response, detail views with path
parameters included: the preview requests with the spec's example values (or
the same deterministic sample the mocks return), and the mocks answer any id.
Operations that carry or manage a credential — `login`, `logout`, `token`,
`session`, a `password` / `api_key` parameter — are excluded, because a
workbench calls every preview's operation the moment it opens.

**What it shows.** Chosen from the response type at generation time: a list of
records is a table of the model's declared fields, one record a description
list, anything else its value as text — never a JSON dump. Password, token and
secret fields are not displayed.

**The axes** are real props, so Atlas builds controls for them: `force`
(`loading` / `error` / `empty` — the states a live request will not produce on
demand), `args` (the request), and `data` (render a value instead of
requesting it). The generated `Data` scenario passes fake data from the
`faker` factories through `data`, seeded so a visual baseline does not flake;
without `faker` it passes the deterministic sample.

Cards render with **no server**: the wrapper installs the generated mock
routes through a transport seam the client reserves. (Endpoints bind to the
client at declaration time, so middleware cannot be added to `createHttp`
afterwards — which a mock installed by a wrapper or a test never can be.)

## Fake data, and data that stays valid

```ts
import { seedFaker, createBook } from './gen/dev'

seedFaker(42)                          // reproducible across runs
const book = createBook()
const lost = createBook({ status: 'lost' })
const many = Array.from({ length: 20 }, () => createBook())
```

`plugins: ['faker']` emits one factory per model. The rule that governs it is
that a factory must produce data its **own schema accepts** — a `maxLength: 8`
field filled with a lorem sentence is a fake that is wrong in exactly the way
real data never is, and it surfaces as a confusing parse error inside somebody
else's test.

But "constraints win" applied bluntly makes every constrained field gibberish,
which defeats the point of reaching for faker at all. So the line is drawn at
what a realistic generator can actually promise:

| the spec states | the factory emits |
| --- | --- |
| nothing | the field-name guess — `email` → `faker.internet.email()`, `city` → `faker.location.city()` |
| `maxLength` only | the same, `.slice(0, max)` — satisfiable, still readable |
| a real `minLength` | `faker.string.alpha({ length: … })` — no realistic generator can promise a lower bound |
| `pattern` | `faker.helpers.fromRegExp(…)`, anchors stripped |
| `enum` | `faker.helpers.arrayElement([…] as const)` |
| a `format` | the format's generator, unclamped — slicing a uuid breaks it |

`maxLength` with no `minLength` is the common shape in a real document, so the
middle row is most of what you get.

The specs for this call the factories and validate the result against the
emitted schema, several hundred draws at a time, which is the only assertion
that can fail for the right reason. The emitted factories also carry **no
`as Model` cast** — one was there first, and removing it is what lets the
typecheck matrix catch a structurally wrong object at all (verified: with the
cast a missing required field passes silently; without it, `TS2322`).

Three real bugs surfaced while writing those specs:
`faker.string.alpha({ min, max })` silently returns a ONE-character string (the
option is `{ length: { min, max } }`), and `faker.helpers.fromRegExp` treats `^`
and `$` as literal characters — so an OpenAPI `pattern`, which almost always
carries anchors, generated a value that failed the very pattern it came from.
  - A `maxLength`-only field overran its bound once the realistic generator was
    kept for that case, because nothing was clamping it.

Recursive models terminate: depth is threaded through the builders explicitly
rather than kept in module state, so concurrent calls cannot interfere.

## Reference pages, from the IR

```
gen/docs/index.md     tags, reach summary, and everything the spec expressed
                      that the client does not
gen/docs/books.md     per operation: contract, params, and the generated hook
gen/docs/models.md    the emitted types
```

`plugins: ['docs']` renders Markdown with frontmatter, so the pages drop into a
`@pyreon/zero-content` collection unchanged and still read correctly on GitHub
with nothing installed.

Kubb reaches for Redoc here, which renders the SPEC. That is a different
document: it tells you the HTTP contract and leaves you to work out which hook
corresponds to `GET /books/{bookId}` and whether it works on iOS. Those are
properties of the GENERATED code, so these pages document that, with the
contract beside it:

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

The `fetch` / `axios` / `ky` clients export the SAME `configureApi` and `auth`.
`use` takes each library's own extension shape — a fetch middleware
`(request, next) => Promise<Response>`, an axios request interceptor
`(config) => config`, a ky `beforeRequest` hook — so an interceptor written for
that library elsewhere drops straight in, and `auth.*` returns that shape. A
differential test runs all four clients against one server and asserts they
send byte-identical requests. Mocks sit at the BOTTOM of every library — the
fetch client's fetch, axios's `adapter`, ky's `fetch` option — so interceptors
and auth run on a mocked request exactly as on a real one.

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

### Infinite queries, declared

Pagination is never guessed — a spec does not say, in any standard way, which
parameter advances a page or where the next value is, and a wrong guess loops
or stops silently. Declare it per operation, in config or in the spec, and each
declaration emits a typed `use<Op>Infinite` hook plus a pure
`<op>InfiniteOptions` factory (for a loader's `prefetchInfiniteQuery`):

```ts
// pyreon.config.ts — keys are the generated operation names
lathe: {
  pagination: {
    listCustomers: { kind: 'lastItem', param: 'starting_after', items: 'data', field: 'id', hasMore: 'has_more' },
    listEvents:    { kind: 'cursor', param: 'cursor', next: 'meta.next_cursor' },
    listRows:      { kind: 'offset', param: 'offset' },            // items default: the response itself
    listPages:     { kind: 'page', param: 'page', items: 'results', initial: 1 },
  },
}
```

```yaml
# or on the operation itself — same shape
get:
  operationId: listEvents
  x-pyreon-pagination: { kind: cursor, param: cursor, next: meta.next_cursor }
```

```ts
const customers = useListCustomersInfinite(() => ({ query: { limit: 20 } }))
customers.data()?.pages          // typed pages
customers.fetchNextPage()        // starting_after = the last customer's id
customers.hasNextPage()          // false once `has_more` is false
```

| `kind` | next value | ends when |
| --- | --- | --- |
| `cursor` | `next` path in the page | it is null/empty, or `hasMore` is false |
| `lastItem` | the last item's `field` (Stripe `starting_after`) | the page is empty, or `hasMore` is false |
| `offset` | current + page length | the page is empty, or `hasMore` is false |
| `page` | current + 1 | the page is empty, or `hasMore` is false |

Each declaration is checked against the spec's own types before anything is
emitted: the parameter must exist, every path must exist, `hasMore` must be a
boolean and the next value's type must be one the parameter takes. A wrong
config entry fails the run with the reason; a wrong spec extension is noted and
skipped.

## Honest limits

Real, current, and reported per-operation rather than papered over:

| Construct | Native |
| --- | --- |
| Schemas: string/number/boolean, nested objects, arrays, optional/nullable, min/max/email/url/uuid/regex | lowers |
| `GET` with a typed JSON response, with or without path parameters | lowers — a path parameter becomes a prop of the data component |
| `GET` with no content, or a non-JSON response | **web-only** — the web hook resolves to `unknown`, and there is no declared type for a native query to decode into, so no data component is emitted |
| the generated data components (`<Op>Data`, a render prop returning an accessor, so it re-renders on the web) | lowers **only with a `@pyreon/native-compiler` that supports render props**. Against an older compiler, with `swiftc`/`kotlinc` installed, the verifier reports the module `BROKEN`, which is the honest answer |
| an array / scalar / union MODEL | lowers — inlined at its use sites; PMTC synthesizes structs from object literals only |
| `POST`/`PUT`/`PATCH`/`DELETE` | **web-only** — mutations are not recognised yet |
| `enum` / `const` | narrowed to its base scalar (`string` / `number` / `boolean`) on the native path; the constraint is genuinely lost there |
| a model field naming another model | **lowers under `validator: 'zod'`** (inlined); dropped under the default `s.*`, with a compiler warning |
| a `$ref` **cycle** | web-only for that field — there is no finite nesting to inline, on either validator |
| `date` / `date-time` | kept as strings on both paths, deliberately — `s.date()` does not lower, and parsing to a `Date` on web only would be a silent divergence |

A relative `baseUrl` (or a spec with no `servers`) makes **every** operation
web-only, because there is no absolute URL to bake. So does any `client` other
than `pyreon` — and that combination is refused at config time rather than
generating modules that lower to nothing.

## Config

Relative paths are relative to the **config file**; the config is the nearest
`pyreon.config.*` walking up from the working directory (stopping at the
repository root), or the one named by `--config`. Every key:

| key | default | |
| --- | --- | --- |
| `input` | — (required) | the OpenAPI 3.x document |
| `output` | `./src/gen` | where the client is written |
| `source` | — | the URL `lathe pull` fetches `input` from |
| `target` | `web` | `multiplatform` also emits and verifies native modules |
| `plugins` | `schemas, client, queries` | see [Pick only what you want](#pick-only-what-you-want) |
| `client` | `pyreon` | `fetch` / `axios` / `ky`; only `pyreon` reaches native |
| `validator` | `pyreon` | `zod`; both reach native |
| `baseUrl` | `servers[0].url` | must be an absolute literal to reach native |
| `strictNative` | `false` | exit 1 when a native module does not lower |
| `projects` | — | several specs in one run |

`@pyreon/config`'s `LatheSection` is the same type, held identical by a
compile-time test, so `defineConfig` rejects a misspelt plugin.

```ts
// pyreon.config.ts
export default {
  lathe: {
    input: './openapi.yaml',
    output: './src/gen',
    target: 'multiplatform',
    // 'pyreon' (default) | 'fetch' | 'axios' | 'ky' — only pyreon reaches native.
    client: 'pyreon',
    // 'pyreon' (default) | 'zod' — both reach native; zod lowers strictly more.
    validator: 'pyreon',
    plugins: ['schemas', 'client', 'queries', 'mocks', 'atlas'],
    strictNative: true,
    // 'strict' (default) | 'warn' | 'off' — what the web client does with a
    // response that does not match its schema. `warn` logs and passes the raw
    // body through; `off` also skips the validation cost on large lists.
    responseValidation: 'strict',
  },
}
```

### The HTTP client is selectable

```ts
lathe: { input: './openapi.yaml', client: 'axios' }
```

```bash
lathe generate --client ky
```

| `client` | emits | reaches native |
| --- | --- | --- |
| `pyreon` (default) | `createHttp` + `api.endpoint(...)` from `@pyreon/http` | **yes** |
| `fetch` | a self-contained endpoint factory, no dependency at all | no |
| `axios` | the same factory over an exported `AxiosInstance` | no |
| `ky` | the same factory over an exported `KyInstance` | no |

**Only `client.ts` changes.** Endpoints, hooks, `keys.ts`, the previews and the
barrel are byte-identical across all four, because they only ever touch an
endpoint's callable / `.key` / `.query()` shape — the seam. Swapping the client
is a one-word edit that leaves every call site alone.

An adapter does **not** wrap `@pyreon/http`. Choosing axios means genuinely not
depending on it, so the endpoint factory is emitted into `client.ts` and reads
in full — about a hundred lines with nothing hidden behind an import.

The instance is exported unconfigured, so interceptors, auth headers and
retries are added the way that library documents:

```ts
import { instance } from './gen/client'

instance.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${token()}`
  return config
})
```

#### What is matched, and what deliberately is not

The URL is resolved by the generated code and handed to the transport
fully-formed, so the instance carries no `baseURL` / `prefixUrl`. That is not
tidiness — axios and ky each resolve a base differently from the other and from
`@pyreon/http` (both treat a leading-slash path as WHATWG resolution, which
discards the base's own path segment), and letting them do it would make the
same spec issue a different request depending on one config word.

So every adapter matches `@pyreon/http` exactly on **URL construction**, **query
encoding**, **cache-key shape** and **error shape**, and a differential test
holds it there using `@pyreon/http`'s own `buildUrl` as the oracle rather than a
table of expectations.

One thing is deliberately **not** matched:

| | `pyreon` | `fetch` | `axios` | `ky` |
| --- | --- | --- | --- | --- |
| retries a 5xx GET | no | no | no | **twice** |

That is ky's own documented default, and someone who picked ky picked it.
Normalising it away would be as surprising as leaving it undocumented, so it is
asserted in the test suite and stated here.

`target: 'multiplatform'` with a non-Pyreon client is **refused**, not silently
downgraded — PMTC lowers `createHttp` and `api.endpoint(...)` by name, so native
modules over axios would lower to nothing, which is precisely the regression
that target exists to catch.

### The schema library is selectable too

```ts
lathe: { input: './openapi.yaml', validator: 'zod' }
```

`pyreon` (the default) emits `@pyreon/validate` `s.*`; `zod` emits `z.*`. Both
satisfy Standard Schema, so the endpoint layer — and every generated adapter
client — accepts either without knowing which was chosen. The two settings
compose: `client: 'axios'` with `validator: 'zod'` is an ordinary combination.

The vocabulary is shared almost exactly, so this is one walk with a different
binding rather than two renderers that can drift. Every spelling was verified
against the installed zod (4.4.3) rather than inferred from its changelog —
`z.string().email()` is deprecated there in favour of `z.email()`, and the
deprecated form is emitted **deliberately**: it works in zod 3 *and* 4, while
the newer one exists only in 4.

#### zod still lowers a real spec's shared gap the first-party validator does not

Both reach native, through different doors. PMTC reads `s.object({ … })`
directly; it reads zod only inside `@pyreon/validation`'s `zodSchema(...)`.
Measured against the real compiler:

| shape | `s.*` | zod |
| --- | --- | --- |
| scalars, optional, nullable, arrays of scalars | lowers | lowers |
| a **nested object** | **lowers** | **lowers** |
| an **array of objects** | **lowers** | **lowers** |
| a field **naming another model** | dropped | dropped |

Nested objects and arrays-of-objects used to be dropped under `s.*` — a
`@pyreon/native-compiler` bug (a re-entry wrapper synthesized for the
wrapper-less form built a callee literally named `null`) — and are fixed now.

The REMAINING shared gap — a field naming another model — is what every
OpenAPI document of any size is full of, and it is why `validator: 'zod'` is
still not merely an interoperability option. Under zod it closes: refs are
**inlined** on the native path (this generator's own choice, not a compiler
capability), and an inlined ref is a nested object, which now lowers under
EITHER validator. So a spec whose `Book` has an `author: $ref` produces

```swift
struct PyreonZodSchema_Book: Codable {
  var id: String = ""
  var author: PyreonZodSchema_Book_Author = PyreonZodSchema_Book_Author()
}
```

where the default validator emits that struct **without `author`**, and says so
in a warning — this generator does not (yet) inline a `$ref` for the `s.*`
path, so the gap survives even though the compiler could now lower the
inlined shape.

A `$ref` **cycle** has no finite nesting, so it falls back to naming the target;
the compiler drops that one field with a warning. Honest, bounded, and the
generator does not hang.

The matrix above is pinned by a test that runs the real compiler, so if this
generator starts inlining `$ref`s for `s.*` too, this README gets corrected in
the same change instead of quietly becoming a lie.

### Pick only what you want

`plugins` is the whole emitter set; omit one and it does not run. Schemas alone
is a normal thing to want:

```ts
lathe: { input: './openapi.yaml', output: './src/schemas', plugins: ['schemas'] }
```

```bash
lathe generate --plugins schemas          # just s.* schemas + types
lathe generate --plugins schemas,mocks    # ...and deterministic fixtures
lathe generate --plugins docs             # just the Markdown reference
```

| plugin | emits | needs |
| --- | --- | --- |
| `types` | plain TypeScript types, no runtime | — |
| `schemas` | `@pyreon/validate` schemas + inferred types | — |
| `client` | the `createHttp` client + one endpoint per operation | `schemas` |
| `queries` | `useQuery` / `useMutation` hooks + `keys.ts` | `client` |
| `mocks` | route table for `@pyreon/http`'s mock middleware | `client` |
| `faker` | one `createX(overrides?)` factory per model | `schemas` |
| `components` | one browsable preview per read operation | `queries` |
| `atlas` | workbench scenarios + wrapper | `components`, `mocks` |
| `docs` | Markdown reference pages | — |

The **needs** column is import edges in the emitted code, not preferences —
`queries/*.ts` imports `endpoints/*.ts`, `components.tsx` imports the hooks. A
selection is expanded to cover them rather than refused, and the report says
what came along:

```
plugins: components (+schemas, +client, +queries - required by them)
```

`faker` needs `schemas` for a reason worth stating: the factories exist to
produce data the SCHEMA accepts, and without schemas there is nothing for them
to be correct against and no round-trip test that could prove they are. `docs`
needs nothing at all — it renders from the IR and is imported by no one, which
makes it the one plugin with no edges in either direction.

**`components` does not depend on Atlas.** The previews are ordinary Pyreon
components over the generated hooks — nothing in them is workbench-shaped, so
a project that wants browsable data components without a workbench selects
`components` and gets exactly that. The dependency runs one way only.

`target: 'multiplatform'` is additive on top of whichever of these you picked —
it adds the native LAYOUT for `client`/`queries`, so asking for `schemas` alone
gets you schemas alone on both targets.

### Several specs, several outputs

A monorepo usually has more than one API. `projects` runs them in one pass, each
to its own path, with shared settings written once:

```ts
// pyreon.config.ts
export default {
  lathe: {
    // Inherited by every project unless it says otherwise.
    target: 'multiplatform',
    plugins: ['schemas', 'client', 'queries'],
    projects: [
      { name: 'catalog', input: './specs/catalog.yaml', output: './packages/catalog/src/gen' },
      { name: 'billing', input: './specs/billing.yaml', output: './packages/billing/src/gen' },
      // Overrides what it needs to; inherits the rest.
      { name: 'legacy', input: './specs/legacy.json', output: './packages/legacy/src/gen', target: 'web' },
    ],
  },
}
```

`output` is an ordinary path, so pointing a project at **another package in the
workspace** is the intended use — the generated client lives in the package that
owns it, and the imports between generated files stay internal to that output
directory.

`lathe check` covers every project and fails if ANY is stale. A CLI `--out` or
spec path alongside `projects` is **refused**, not applied to all of them: one
path cannot address one project among many, and writing every client into a
single directory is never what was meant.

`lathe check` regenerates in memory and fails when committed output has drifted
from the spec — the CI half, same contract as `gen-docs --check`.

## CLI

```bash
lathe init     [spec]          # set up pyreon.config.ts from what the project has
lathe generate [spec]          # read the spec, write the client
lathe check    [spec]          # generate in memory; exit 1 if anything is stale
lathe pull     [url] [dest]    # fetch a remote spec
```

`lathe --help` lists every flag. Flags are strict — an unknown flag, command or
value is an error with a did-you-mean and exit code `2`, rather than being
ignored. `--dry-run` reports what `generate` would write and remove. Errors go
to stderr; colour only reaches a TTY and respects `NO_COLOR`.

`--json` prints one documented shape for every command and any project count —
`{ ok, command, projects: [...], error? }` (`JsonReport` in
`@pyreon/lathe/cli`); an error under `--json` is still JSON.

### Pulling a remote spec

```bash
lathe pull https://api.example.com/openapi.json            # to the configured input
lathe pull https://api.example.com/openapi.json spec.json  # to a path, no config needed
lathe pull                                                 # every project with a `source`
lathe pull --token "$TOKEN" --header "X-Team: core"        # a spec behind auth
```

`$LATHE_TOKEN` is used when `--token` is absent. Nothing is written unless the
response is an OpenAPI 3.x document. `ETag` / `Last-Modified` are kept under
`node_modules/.cache/lathe` and sent back as a conditional request — only while
the file on disk is still exactly what was fetched.

### Generated code documents itself

Hover a generated symbol and you get the spec's words, not the generator's:
summary and description, one bullet per parameter (location, optionality,
meaning), `@deprecated` for a deprecated operation, parameter, property or
schema, a `@see` link from `externalDocs`, and an `@example` built from the
spec's examples — or from the same deterministic sample the mocks return, so
the call you paste is one the mocks answer. Model interfaces carry each
field's description and example. Each file opens with one two-line header.

### Losses and choices

Every spec feature the client does not honour is a note with a stable `code`,
an RFC 6901 pointer and a severity: `loss` (security schemes, response
headers, error bodies, non-default serialization, a non-scalar `const`,
`deprecated`, an optional body the generated call requires, …) or `choice`
(JSON picked over XML, the first tag, the summary over the description). The
report leads with the losses and summarises the choices.

### Generated files are pruned

Each run writes `lathe-manifest.json` listing the files it generated; the next
`generate` removes the ones it no longer produces, and `check` reports them as
stale. Only listed paths are ever removed. Commit the manifest.

## YAML is read strictly

YAML goes through the [`yaml`](https://eemeli.org/yaml/) package (ISC, zero
dependencies) as YAML 1.2 core. An earlier first-party reader covered "the
subset OpenAPI uses" and turned out to refuse GitHub, Stripe, OpenAI, Twilio
and DigitalOcean outright while silently corrupting block scalars in the files
it did open. Anchors, aliases and merge keys are now resolved. Refused, with a
line number: duplicate keys, a multi-document stream, custom tags (`!Ref`), a
recursive alias, `.inf` / `.nan`, a collection used as a key, and tab
indentation — each would otherwise produce a document the author did not
write. A UTF-8 BOM is accepted on both the JSON and the YAML path.

## What the reader represents

The input layer resolves a spec's semantics once, so no emitter rediscovers them:

- **Nullability everywhere** — 3.0 `nullable`, 3.1 `type: [X, 'null']` and `anyOf: [X, {type: 'null'}]` on any node, component models included.
- **`enum` / `const` of any JSON scalar** (numbers, booleans, `null`), and constraints on the type itself — `minLength`, `pattern`, 3.0 and 3.1 exclusive bounds, `multipleOf` (float-safe for fractional steps), `minItems` / `maxItems` / `uniqueItems` — so they apply to array items and alias models too.
- **Composition** — `allOf` merges `required` across parts, lets a later part narrow a field, and DISTRIBUTES over a member that is a `oneOf` (`A ∧ (B ∨ C)` becomes `(A ∧ B) ∨ (A ∧ C)`, keeping the discriminator); properties next to a `oneOf` apply to every member; `oneOf` and `anyOf` together are both enforced. A discriminator the schema library cannot build (an implicit one, or over a non-object member) becomes a plain union with a note, never a module that throws at import.
- **`readOnly` / `writeOnly`** — the model keeps its RESPONSE shape and gains a `<Name>Input` REQUEST shape, used for bodies and parameters.
- **`$ref` siblings** — a constraint next to a `$ref` (`{ $ref: Code, maxLength: 3 }`, `{ $ref: Base, required: [id] }`) merges with the target; annotation-only siblings keep the named reference.
- **Cycles** — a recursive schema anywhere (`#/$defs/Node`) is hoisted into a named model; a cycle made only of `$ref`s is `unknown` with a `cyclic-ref` note.
- **Request media types** — `json`, `form` (with the spec's per-field `encoding`), `multipart` (binary fields typed `Blob`), `text` and raw binary bodies each travel as what the server accepts. `application/json; charset=…`, `*+json` and `*/*` count as JSON.
- **Parameters** — header and cookie parameters are typed call arguments; an operation-level parameter overrides a path-level one; an undeclared path placeholder is synthesized.
- **Servers** — variables take their `default`; an operation- or path-level server travels with its operation (on native, as its own literal-base client); a relative server is reported, and `lathe pull` prints the absolute URL it resolves to.
- **Names** — models, operation ids, path placeholders and tag files that normalize to one identifier are disambiguated deterministically; nothing is dropped.

## Contract changes

`lathe` writes an `api-surface.json` beside the generated code: a compact record
of what the run promised — which operations exist, what they take, what they
return. The next run diffs against it.

This exists because a spec edit is the one change here that can break an app
without breaking a build. Delete a response field, regenerate, and everything
still typechecks — against the new types, which agree with the new spec and with
nothing the app was written for. The failure arrives at runtime, as a value that
is suddenly `undefined`.

```
contract  2 breaking  1 additive
  ! [field-removed]     Book.pages   was integer
  ! [field-now-optional] Book.status  required → optional
  + [field-added]       Book.isbn    string (optional)
```

Severity is always from the CLIENT's side, which is not symmetric with the
server's:

| change | severity | why |
| --- | --- | --- |
| response field removed | breaking | the app reads it |
| response field required → optional | breaking | the app was entitled to assume presence |
| response field added | additive | nobody was reading it |
| request param added as required | breaking | existing calls omit it |
| request param removed | additive | the request still goes out; the server ignores it |
| operation removed or moved | breaking | the call site no longer resolves |

`--fail-on-breaking` exits non-zero when any breaking change is present. Pair it
with `generate` rather than `check`: the baseline moves when output is written,
so it fires on the run that CAUSES the change rather than on every run
afterwards. It is opt-in on purpose — on a feature branch the spec is supposed
to move, and a gate that fires there gets disabled rather than heeded.

A missing or wrong-version baseline reports no changes rather than reporting
every operation as added: a wall of "additive" on day one teaches people to skim
the section.
