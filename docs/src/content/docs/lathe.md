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
| `strictNative` | `boolean` | `false` | exit 1 when a native module does not lower |
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
the response is an OpenAPI 3.x document — an error page, a login redirect,
Swagger 2 and oversized bodies are all refused. The response's `ETag` /
`Last-Modified` is kept under `node_modules/.cache/lathe`, and the next pull is
a conditional request — but only while the file on disk is still exactly what
was fetched, so a local edit is always re-downloaded rather than "confirmed
unchanged".

## Losses and choices

Every spec feature the generated client does not honour becomes a **note**, with
a stable `code`, an RFC 6901 pointer into the spec, and a severity:

- **`loss`** — the spec says something the client does not do. These are the
  ones to read.
- **`choice`** — Lathe picked one of several equivalent readings; nothing the
  spec requires is lost.

| code | severity | what it means |
| --- | --- | --- |
| `unsupported-parameter` | loss | a parameter in a location 3.x does not define (`body`, `formData`) — not part of the generated call |
| `unsupported-security` | loss | a security scheme or requirement — the client sends no credentials |
| `response-headers` | loss | response headers are not exposed; the call resolves to the body |
| `error-responses` | loss | 4xx/5xx bodies are not typed; a failure rejects with an `unknown` body |
| `other-success-responses` | loss | only the first 2xx is typed |
| `parameter-serialization` | loss | a non-default `style` / `explode` / `allowReserved` |
| `optional-request-body` | loss | the spec's body is optional, the generated body argument is required |
| `deprecated` | loss | the generated code carries no `@deprecated` marker |
| `unsupported-const` | loss | a `const` whose value is not a JSON scalar — not enforced (a scalar `const` is) |
| `non-json-media-type` | loss | no JSON media type; the body is typed `unknown` |
| `unsupported-schema` / `unsupported-ref` | loss | a schema or `$ref` that reduces to `unknown`, or a degradation (a discriminator that cannot be proven, a contradictory `allOf`) |
| `cyclic-ref` | loss | a `$ref` cycle through references alone, or the cyclic part of an `allOf` — contributes nothing |
| `int64-precision` | loss | one note for every `format: int64` number — `JSON.parse` rounds past 2^53 − 1 before validation, so no generated type (bigint or string) can recover the value; typed as `number` |
| `no-servers` | loss | no absolute base URL (none declared, relative, or a variable with no default), so nothing reaches native |
| `multiple-content-types` | choice | JSON picked among several media types |
| `extra-tags` | choice | grouped under the first tag only |
| `description-dropped` | choice | the JSDoc carries the summary, not the description |
| `missing-operation-id` | choice | a name derived from method + path |
| `numeric-version` | choice | `info.version` was a YAML number |

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

- **OpenAPI 3.0 and 3.1 only.** Swagger 2 is refused with the conversion command.
- **Security schemes, response headers and error bodies are not generated** —
  each is reported as a `loss` note. (Header and cookie parameters ARE: they are
  typed `headers:` / `cookies:` call arguments.)
- **A read with no typed JSON response** gets a web hook typed `unknown` and no
  native data component.
- **Mutations are web-only on the native target.** PMTC recognises queries, not
  mutations, so a `POST` operation is reported `web-only` with that reason.
- **A relative `baseUrl` makes every operation web-only** — PMTC bakes the
  request URL at compile time.
- **No multi-project composition.** `projects: [...]` writes N independent
  output trees; there is no combined entry across them.
- **`faker` does not reach native**, and neither do the preview components.
- A `$ref` **cycle** has no finite nesting, so the native schema names the
  target and the compiler drops that one field with a warning.

## Troubleshooting

**`this is a Swagger 2.0 document, and Lathe reads OpenAPI 3.x`** — convert it
first: `npx swagger2openapi swagger.json -o openapi.json`. Reading Swagger 2 as
3.x would produce an empty client.

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
