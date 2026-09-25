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
# or: bun add -d @pyreon/lathe
```

`@pyreon/native-compiler` is an optional peer: install it to have
`target: 'multiplatform'` verify its own output. `@faker-js/faker` is needed
only for the `faker` plugin, `zod` only for `validator: 'zod'`.

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
becomes a `note` with a stable code, a JSON-pointer location and a severity, so
a loss is reported once instead of rediscovered by six emitters — and it lands
in the generated reference pages, not only in the terminal. See
[Losses and choices](#losses-and-choices).

### YAML is read strictly

YAML is parsed by the [`yaml`](https://eemeli.org/yaml/) package (ISC, zero
dependencies) as YAML 1.2 core, so the multi-line scalars, `- >-` items and
nested sequences every YAML dumper writes all read correctly. Anchors, aliases
and merge keys are resolved. What the reader **refuses**, with a line number,
is everything that would otherwise produce a document the author did not
write: duplicate keys, a multi-document stream, custom tags (`!Ref`), a
recursive alias, `.inf` / `.nan`, and tab indentation.

### What the reader represents

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
- **Error responses** — every `4xx` / `5xx` / `4XX` / `default` JSON body is typed per operation (see [Typed errors](#typed-errors)).
- **Webhooks and callbacks** — typed as payload schemas and handler types (see [Webhooks and callbacks](#webhooks-and-callbacks)).

### Swagger 2.0 is up-converted

A `swagger: "2.0"` document is converted to OpenAPI 3.0 in process before it is
read, following `swagger2openapi`'s mapping: `definitions`, body and `formData`
parameters (a file field makes the body `multipart`), `produces` / `consumes`,
`securityDefinitions`, `host` + `basePath` + `schemes` (https first; a missing
scheme comes from the URL the spec was pulled from), `x-nullable`,
`type: file`, `collectionFormat` → `style` / `explode` (an array with no
`collectionFormat` is `csv`, Swagger 2's default), responses and string
discriminators. What 3.0 cannot spell is a `swagger2-lossy` note:
`collectionFormat: tsv`, per-operation `schemes` that exclude the client's
scheme, an unknown security type. Kubernetes' 1,202-operation spec generates
output that typechecks with every plugin. Swagger 1.x is refused.

### Specs split across files

A `$ref` into another document — `$ref: '../models/pet.yaml'`,
`$ref: 'parameters.yml#/droplet_id'`, JSON or YAML, relative or absolute — is
resolved against the spec's own file and the documents are bundled into one
before generation:

- A target in a **schema** position becomes a model named after it (the
  pointer's last segment, else the file name; a collision is qualified by the
  file — `pages_pagination` — before it is numbered). Two references to one file
  are one model, and a cycle across files closes like one inside a file.
- A root component that is only a reference (`Droplet: { $ref: models/droplet.yml }`)
  keeps its own name.
- Path items, operations, parameters, responses and headers from other files
  are inlined.
- An unreadable file or an inline self-inclusion is a note; `example` / `enum`
  / `default` values are data and never rewritten.

`generate` reads files, not the network, by default: a remote `$ref` is
reported, and `lathe pull` (below) bundles it. `remoteRefs: 'fetch'` lets
`generate` download the remote parts of a spec on disk itself, with the same
rules as `pull` — each part conditional on its own `ETag`, credentials from
`remoteHeaders` sent only to their origin, and a part that cannot be fetched
failing the run instead of becoming `unknown`:

```ts
export default {
  lathe: {
    input: './openapi.yaml',
    remoteRefs: 'fetch',
    remoteHeaders: { 'https://specs.internal.test': { Authorization: `Bearer ${process.env.SPEC_TOKEN}` } },
  },
}
```

Opting in makes the output depend on those servers, so a `check` in CI needs
network access to them. `--watch` and the Vite plugin regenerate when
any referenced file changes. DigitalOcean's own 2,954-file description
produces the same 1,151 models and 715 operations as Redocly's bundle of it.

## Entry points mirror the dependency graph

A generator produces an import **graph**, and the entry points are where that
graph becomes visible to a bundler.

```
gen/index.ts            production — schemas, client, endpoints, queries, keys
gen/dev.ts              fixtures and faker factories (node-safe, no JSX)
gen/endpoints/index.ts  every call, no hooks   (loaders, scripts, server code)
gen/queries/index.ts    every hook, no previews
gen/queries/books.ts    one tag — Vite emits one chunk per tag file
gen/schemas.ts          re-exports every schema module
gen/schemas/Book.ts     one module per model (a `$ref` cycle shares one)
gen/package.json        the sideEffects marker
```

An operation the spec does not tag is grouped by its first static path segment
after the prefix all untagged paths share (`/v1/customers/{id}` → `customers`),
not dumped in one `default` module — Stripe tags nothing, and that module was
612 endpoints. A path group whose file name matches a real tag joins it.

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

### A hook's bundle is what the hook uses

Two changes, both needed: **one schema module per model** (a `$ref` cycle shares
one, since a cycle split across ES modules evaluates in whatever order the
importer happened to pick), and **`/* @__PURE__ */` on every emitted call** —
each `s.*` builder, arguments included, and each `api.endpoint(…)` — so an
unused declaration inside a reached module is dropped as well.

Vite 8.2.2, one hook, gzipped (generated code only / with the runtime):

| | GitHub `useIssuesGet` | Stripe `useGetCustomersCustomer` |
| --- | ---: | ---: |
| before | 94.4 KB / 121.1 KB | 70.8 KB / 97.7 KB |
| pure annotations only | 10.5 KB / 37.3 KB | 61.1 KB / 87.8 KB |
| per-model modules only | 5.2 KB / 31.7 KB | 69.2 KB / 96.0 KB |
| **both** | **2.8 KB / 29.2 KB** | **42.8 KB / 69.7 KB** |

Stripe stays large because `Customer` really reaches 928 of 1,537 models
through a 97-model cycle. Earlier docs called the pure annotation "2%": that
measured it on the outer declaration only.

The emitted `package.json` declares the output side-effect-free — an **array**
naming `atlas.wrapper.tsx` when `atlas` is selected, because that file really
does call `installMocks()` at module scope — so an unreached module is dropped
whole, whatever the app's own `package.json` says.

### Model types are written out, not inferred

```ts
export interface Book { id: string; title: string }
export const Book = /* @__PURE__ */ s.object({ … }) as unknown as Schema<Book>
```

Inferring every model (`Infer<typeof Book>`) made each consumer's TypeScript
re-derive the whole spec. tsc instantiations over schemas + client + queries:
Stripe 1,372,857 → 580,009, Stripe under zod 1,043,674 → 364,887, GitHub
1,947,953 → 1,483,741. Agreement between each interface and its schema is
checked by lathe's tests, both ways, for every model. The trade: a generated
schema is a `Schema<Book>`, so object-only builders (`.extend`, `.pick`) do not
type-check on it.

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

## Response validation is configurable

```ts
lathe: { input: './openapi.yaml', responseValidation: 'warn' }
```

`'strict'` (default) rejects a response that does not match its schema,
`'warn'` logs and passes the raw body through, `'off'` skips validation — and
its cost on large lists. The same meaning on every client: passed to
`createHttp({ validate })` for `pyreon`, baked into the generated validation step
for `fetch` / `axios` / `ky`. Native modules decode into typed structs and are
not affected.

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
  plugins: [lathe({ checkOnBuild: true }), pyreon()],
})
```

The plugin reads the `lathe` section of `pyreon.config.ts` itself — the same
file, found the same way, as the CLI — so the call above is all a configured
project needs. Options passed to `lathe()` win per key.

It generates once on dev-server start and again whenever a spec or the config
changes, and prints what moved: breaking contract changes by name, how many
spec features are not represented, files written and removed. A spec path that
does not exist is a warning with a suggestion, not silence. `checkOnBuild` turns
a stale client into a **build error** rather than a warning.

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

### Typed errors

Every `4xx` / `5xx` / `4XX` / `default` response with a JSON body is declared on
its endpoint (`errors: { 404: NotFound, default: Problem }`). A failed call
rejects with an `HttpError` whose `body` has been validated against the most
specific match — exact status, then range, then `default` — and whose
`matched` names the key it passed:

```ts
import type { EndpointError } from './gen/client'

const pet = useGetPetById(() => ({ params: { petId: id() } }))
const err = pet.error() // EndpointError<typeof getPetById> | null
if (err?.matched === '404') show(err.body.message) // NotFound
else if (err?.matched === 'default') report(err.body.code) // Problem

getPetById({ params: { petId: 1 } }).catch((e: EndpointError<typeof getPetById>) => …)
```

Declared errors are part of the contract `api-surface.json` records: removing a
key or changing its body is **breaking** (a branch narrowing on it stops
running, or reads the old shape); adding one is additive — except when a `4XX`
or `default` already covered that status, which re-routes those responses to
the new key and is breaking too.

A body that fails its schema is still the same HTTP failure, with `matched`
undefined and the raw body — replacing it with a schema error would hide what
the server said. A network failure, a timeout or a cancellation has no
`matched`, so the union narrows cleanly. Query, mutation and infinite hooks all
carry the type, on every client (`fetch`, `axios` and `ky` throw a
`LatheHttpError` of the same shape). Only an error body that is not JSON is
still untyped, with an `error-responses` note.

### Webhooks and callbacks

3.1 `webhooks` and operation `callbacks` are requests the API SENDS, so they get
no endpoint or hook. With the `schemas` plugin they produce `webhooks.ts` — a
schema per payload, and a handler type inferred from it:

```ts
import { webhookSchemas, type WebhookHandler } from './gen'

const onNewPet: WebhookHandler<'newPet'> = (pet) => console.log(pet.name)

app.post('/hooks/new-pet', async (req) => {
  const result = await webhookSchemas.newPet['~standard'].validate(await req.json())
  if (!result.issues) await onNewPet(result.value)
})
```

A callback is keyed `<operationId>.<callbackName>`; an entry with several
methods gets `.post` / `.put` suffixes.

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

`validate` also has a config default — `lathe: { responseValidation: 'warn' }` — for a
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

An error `status` with no body of its own answers with the operation's
declared error fixture (exact status, then range, then `default`) — schema-valid,
so the generated client's `err.matched` branch is the one the test drives:

```ts
mockOperation('getPetById', { status: 404 }) // body from the spec's 404 schema
// pet.error()?.matched === '404'
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
## Configuration reference

Every key of the `lathe` section of `pyreon.config.ts`. `@pyreon/config`'s
`defineConfig` types the same keys — the two types are held identical by a
compile-time test in `@pyreon/lathe`, so a key that exists here is one the tool
reads.

Relative paths resolve against the directory of the **config file**, not the
shell's working directory, so `lathe` behaves the same from any subdirectory.
Paths passed on the command line are relative to the working directory.

| key | type | default | meaning |
| --- | --- | --- | --- |
| `input` | `string` | — (required) | the OpenAPI 3.0/3.1 document, `.json` / `.yaml` / `.yml` |
| `output` | `string` | `./src/gen` | directory the client is written to |
| `source` | `string` | — | http(s) URL `lathe pull` fetches the spec from |
| `target` | `'web' \| 'multiplatform'` | `'web'` | `multiplatform` also emits and verifies native modules |
| `plugins` | plugin names | `['schemas', 'client', 'queries']` | see [Plugins](#plugins) |
| `client` | `'pyreon' \| 'fetch' \| 'axios' \| 'ky'` | `'pyreon'` | HTTP runtime; only `pyreon` reaches native |
| `validator` | `'pyreon' \| 'zod'` | `'pyreon'` | schema library; both reach native |
| `baseUrl` | `string` | the spec's `servers[0].url` | must be an absolute literal to reach native |
| `responseValidation` | `'strict' \| 'warn' \| 'off'` | `'strict'` | the web client's default response validation; `configureApi({ validate })` switches it at runtime |
| `pagination` | `Record<operation, PaginationConfig>` | — | declared infinite queries; see [Infinite queries](#infinite-queries-declared) |
| `strictNative` | `boolean` | `false` | exit 1 when a native module does not lower |
| `remoteRefs` | `'off' \| 'fetch'` | `'off'` | a `$ref` into a REMOTE document in a spec on disk: `off` reports it and stays offline; `fetch` downloads it with `lathe pull`'s rules (ETag cache, credentials per origin, a failed fetch fails the run) |
| `remoteHeaders` | `Record<origin, Record<string, string>>` | — | headers for `remoteRefs: 'fetch'`; each set is sent only to its own origin |
| `projects` | `{ name, input, ...any key above }[]` | — | several specs in one run; see [Several specs](#several-specs-one-pass) |

An unknown `plugins`, `client`, `validator` or `target` value is refused by
name, with the known values listed.

## Command line

```bash
lathe generate [spec]          # read the spec, write the client
lathe check    [spec]          # generate in memory; exit 1 if anything is stale
lathe pull     [url] [dest]    # fetch a remote spec (see below)
lathe [spec]                   # same as lathe generate [spec]
```

| flag | |
| --- | --- |
| `--target web\|multiplatform` | override `target` |
| `--out <dir>` | override `output` |
| `--plugins a,b` | override `plugins` |
| `--client …` / `--validator …` | override `client` / `validator` |
| `--base-url <url>` | override `baseUrl` |
| `--config <file>` | use this config instead of the nearest `pyreon.config.*` |
| `--dry-run` | report what `generate` would write and remove; touch nothing |
| `--strict-native` | exit 1 when a native module fails to lower |
| `--fail-on-breaking` | exit 1 when the spec breaks the client contract |
| `--json` | machine-readable output (shape below) |
| `--watch`, `-w` | regenerate when a spec **or the config** changes |
| `--color`, `--no-color` | force colour; by default only a TTY gets it, and `NO_COLOR` turns it off |
| `--version`, `-v` / `--help`, `-h` | |

The config is the nearest `pyreon.config.*` found walking **up** from the
working directory, stopping at the repository root.

Flags are strict: an unknown flag, an unknown command, a missing value or an
invalid one is an error with a suggestion (`unknown option --josn. Did you mean
--json?`), and nothing runs. Exit codes: `0` success, `1` failure (a stale
check, a refused spec, a failed gate), `2` a usage error. Errors go to stderr.

### `--json`

One shape for every command and any number of projects:

```ts
interface JsonReport {
  ok: boolean                       // the run exited 0
  command: 'generate' | 'check' | 'pull' | 'help' | 'version'
  projects: Array<{
    name: string                    // '' for a single-project config
    title: string; version: string
    models: number; operations: number
    target: 'web' | 'multiplatform'; output: string
    files: string[]                 // every generated path
    wrote: number                   // files written this run
    removed: string[]               // orphans removed (see below)
    stale: string[]                 // check / --dry-run: paths that would change
    dryRun: boolean
    reach: Record<string, { reach: 'web+native' | 'web-only'; reason?: string }>
    notes: Array<{ code: string; at: string; message: string; severity: 'loss' | 'choice' }>
    verify: { ran: boolean; reason?: string; files: unknown[] }
    changes: Array<{ code: string; severity: 'breaking' | 'additive'; subject: string; detail: string }>
  }>
  error?: { message: string }       // a run that failed before producing a report
}
```

An error under `--json` is still JSON (`ok: false`), never plain text on stdout.
The types are exported from `@pyreon/lathe/cli` as `JsonReport` / `JsonProject`.

## Pulling a remote spec

`lathe pull` lands the spec on disk; `generate` never fetches. Output that
depended on a server's mood would make `check` fail in CI for reasons nobody can
reproduce.

```bash
lathe pull https://api.example.com/openapi.json            # to the configured input
lathe pull https://api.example.com/openapi.json spec.json  # to a path, no config needed
lathe pull                                                 # every project with a `source`
lathe pull --token "$TOKEN"                                # Authorization: Bearer …
lathe pull --header "X-Api-Key: $KEY"                      # any header, repeatable
```

`$LATHE_TOKEN` is used when `--token` is not given. Nothing is written unless
the response is an OpenAPI 3.x or Swagger 2.0 document — an error page, a login
redirect and oversized bodies are all refused. The response's `ETag` /
`Last-Modified` is kept under `node_modules/.cache/lathe`, and the next pull is
a conditional request — but only while the file on disk is still exactly what
was fetched, so a local edit is always re-downloaded rather than "confirmed
unchanged".

A spec that `$ref`s other documents is fetched WHOLE: every referenced document
is downloaded, each with its own conditional request (the root spec included —
its body is cached beside the parts), and one bundled spec is
written (JSON for a `.json` destination, YAML otherwise). `--header` /
`--token` are sent to the spec's own origin only — never to another host a
`$ref` names. If any referenced document cannot be fetched, nothing is written.

## Losses and choices

Every spec feature the generated client does not honour becomes a **note**, with
a stable `code`, an RFC 6901 pointer into the spec, and a severity:

- **`loss`** — the spec says something the client does not do. These are the
  ones to read.
- **`choice`** — Lathe picked one of several equivalent readings; nothing the
  spec requires is lost.

| code | severity | what it means |
| --- | --- | --- |
| `unsupported-parameter` | loss | a parameter in a location OpenAPI does not define — not part of the generated call (Swagger 2 `body` / `formData` parameters are converted to a request body) |
| `unsupported-security` | loss | a security scheme with no generated `auth` helper (HTTP digest, mutual TLS…), or a requirement naming one |
| `response-headers` | loss | response headers are not exposed; the call resolves to the body |
| `error-responses` | loss | a 4xx/5xx body that is not JSON (or has no schema) is not typed; the rejection's `body` is `unknown` for that status |
| `other-success-responses` | loss | only the first 2xx is typed |
| `parameter-serialization` | loss | a path `style` other than `simple`, or `allowReserved` — query `style` / `explode` are honoured |
| `body-on-get` | loss | a `GET` / `HEAD` request body — `fetch` refuses to send it, so it is dropped |
| `invalid-pagination` | loss | an `x-pyreon-pagination` that does not fit the operation — ignored |
| `deprecated` | loss | the generated code carries no `@deprecated` marker |
| `unsupported-const` | loss | a `const` whose value is not a JSON scalar — not enforced (a scalar `const` is) |
| `unsupported-schema` / `unsupported-ref` | loss | a schema or `$ref` that reduces to `unknown` — including a `$ref` into a file that could not be read, or a remote one at generate time — or a degradation (a discriminator that cannot be proven, a contradictory `allOf`) |
| `cyclic-ref` | loss | a `$ref` cycle through references alone, the cyclic part of an `allOf`, or a path item / response that includes itself across files — contributes nothing |
| `int64-precision` | loss | one note for every `format: int64` number — `JSON.parse` rounds past 2^53 − 1 before validation, so no generated type (bigint or string) can recover the value; typed as `number` |
| `no-servers` | loss | no absolute base URL (none declared, relative, or a variable with no default), so nothing reaches native |
| `multiple-content-types` | choice | JSON picked among several media types |
| `extra-tags` | choice | grouped under the first tag only |
| `description-dropped` | choice | the JSDoc carries the summary, not the description |
| `missing-operation-id` | choice | a name derived from method + path |
| `numeric-version` | choice | `info.version` was a YAML number |
| `swagger2-converted` | choice | the input was Swagger 2.0 and was up-converted to OpenAPI 3.0; other notes point into the converted document |
| `webhooks` | choice | the spec declares webhooks / callbacks — requests the API sends; typed as payload schemas and `WebhookHandler` types in `webhooks.ts`, never as client calls |
| `swagger2-lossy` | loss | a Swagger 2 construct 3.0 cannot spell (`collectionFormat: tsv`, per-operation `schemes`, an unknown security type), or a missing `schemes` assumed `https` |

The terminal report lists the losses and summarises the choices; the generated
reference pages split them into "Not represented" and "Choices made".

## Generated files are pruned

Each run writes `lathe-manifest.json` into the output directory, listing
exactly the files it generated. The next `generate` removes the ones it no
longer produces — a tag dropped from the spec takes its `endpoints/<tag>.ts`
and `queries/<tag>.ts` with it — and `check` reports them as stale. Only paths
on that list are ever removed, so a hand-written file in the output directory is
never touched. Commit the manifest with the rest of the output.

## Honest limits

- **OpenAPI 3.0, 3.1 and Swagger 2.0.** Swagger 1.x is refused.
- **Response headers are not generated** — reported as a `loss` note. (Header
  and cookie parameters ARE: they are typed `headers:` / `cookies:` call
  arguments.) A NON-JSON error body stays untyped.
- **`generate` does not fetch unless told to.** A remote `$ref` in a spec on
  disk is reported by default; `remoteRefs: 'fetch'` or `lathe pull` bundles it. Names of hoisted
  schemas are stable per target, but a new collision can renumber a
  `<name>2` model.
- **Webhooks and callbacks are types and schemas only** — Lathe generates no
  server route or signature verification for them.
- **A read with no typed JSON response** gets a web hook typed `unknown` and no
  native data component.
- **Mutations are web-only on the native target.** PMTC recognises queries, not
  mutations, so a `POST` operation is reported `web-only` with that reason.
- **A relative `baseUrl` makes every operation web-only** — PMTC bakes the
  request URL at compile time.
- **The generated data components need PMTC render-prop support.** Each one
  returns an accessor, `() => props.children(q.data())`, so it re-renders on
  the web when the query settles. A body that ran once would stay at its
  loading state. Only a `@pyreon/native-compiler` with render-prop support
  lowers that shape. The verifier compiles each module when `swiftc` /
  `kotlinc` are installed, and against an older compiler it reports these
  modules `BROKEN` rather than claiming they lower.
- A verdict of **`partial`** means the module lowers but PMTC dropped part of
  a model (a field it cannot represent); the report names the declaration.
- **No multi-project composition.** `projects: [...]` writes N independent
  output trees; there is no combined entry across them.
- **`faker` does not reach native**, and neither do the preview components.
- A `$ref` **cycle** has no finite nesting, so the native schema names the
  target and the compiler drops that one field with a warning.

## Troubleshooting

**`this is a Swagger 1.2 document`** — only Swagger 2.0 is up-converted. Convert
a 1.x description to 2.0 or OpenAPI 3 first.

**A `$ref` to another file is `unknown`** — the spec was generated from a
string with no location (the programmatic `loadOpenApi(text)`), or the ref is
remote. Generate from the spec FILE, or `lathe pull` a remote spec so its parts
are bundled.

**`this document has no openapi version key`** — `input` points at something
that is not an API description. Nothing was written.

**A GET is `web-only` with "no typed JSON response"** — the operation declares
no content (or a non-JSON media type). The web hook resolves to `unknown`; no
native data component is emitted, because there is no declared type to decode
into.

**`discriminator … cannot be proven from the members`** — a member's tag field
is optional, not a string enum, or claims a value another member claims. The
model is emitted as a plain union, which accepts the same data. Make each tag a
required `enum: [value]` to get the tagged form.

**Requests fail with 401 against a client that compiled** — Lathe does not
apply security schemes (the `unsupported-security` note says so). Add the
credential in the transport: on the exported `instance` for `axios` / `ky`.

**The config seems ignored** — run `lathe generate --dry-run`: the report names
the output directory it resolved. The config is found upward from the working
directory (stopping at the repository root), and its paths are relative to the
config file. `--config <file>` names one explicitly.

**`lathe check` fails on `lathe-manifest.json`** — the first run after upgrading
writes the manifest; run `lathe generate` once and commit it.

## Example

[`examples/lathe-bookshelf`](https://github.com/pyreon/pyreon/tree/main/examples/lathe-bookshelf)
generates the whole surface — schemas, client, hooks, keys, mocks, faker, Atlas
scenarios, reference pages and the two native modules — from a 4-operation spec,
and serves the API it talks to as in-process dev middleware so the e2e boots one
thing and still exercises real HTTP.
