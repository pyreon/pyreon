# @pyreon/lathe

Spec-to-client code generation for the Pyreon stack. Reads an OpenAPI 3.x
document; emits `@pyreon/validate` schemas, `@pyreon/http` endpoints,
`@pyreon/query` hooks, mock fixtures and `@pyreon/atlas` scenarios.

```bash
pyreon lathe generate ./openapi.yaml
```

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
  schemas.ts                    books.native.tsx   <- client + schemas +
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
  plugins: [
    lathe({ input: './openapi.yaml', output: './src/gen', checkOnBuild: true }),
    pyreon(),
  ],
})
```

Regenerates on dev-server start and whenever a spec changes. `checkOnBuild`
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

Watches the containing directory with a filename filter rather than the file
itself — editors write via rename as often as in place, and a watch on the
inode dies the first time one replaces it. Events are coalesced, and a spec
that is unparseable mid-save prints the error and keeps watching rather than
exiting.

### `lathe check` in CI

Regenerates in memory and fails if committed output has drifted — the same
contract as `gen-docs --check`, covering every project.

## One import site

```ts
import { keys, useCreateBook, useListBooks, type Book } from './gen'
```

The per-tag split is the generator's business. Nothing in your app needs to
know which tag an operation was filed under, or that tags exist.

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
| `components.tsx` | one browsable preview per read operation |
| `atlas.scenarios.ts` | `Default` / `Loading` / `Error` / `Empty` per preview |
| `atlas.wrapper.tsx` | the `QueryClientProvider`, with mocks installed |

```ts
// atlas.config.ts — names no component, no scenario, no provider
import { scenarios } from './src/gen/atlas.scenarios'
import { wrapper } from './src/gen/atlas.wrapper'

export default { title: 'Bookshelf', scenarios, wrapper, ignore: ['.native.tsx'] }
```

```
atlas: discovered 2 component(s), 8 scenario(s) — 8 verified, 0 failing.
```

The variant axis is the **data state**, not a response field. `loading` and
`error` are the two a live request will not produce on demand and `empty` is
the one a seeded mock hides — the three a UI most often gets wrong. `force` is
a real prop, so Atlas infers a control for it without being told.

Previews cover read operations with no path parameter and no required query
parameter. Anything else would need a value the generator invents, and a
preview built on a guess renders an error rather than the shape it exists to
show.

Cards render with **no server**: the wrapper installs the generated mock
routes through a transport seam the client reserves. (Endpoints bind to the
client at declaration time, so middleware cannot be added to `createHttp`
afterwards — which a mock installed by a wrapper or a test never can be.)

## Honest limits

Real, current, and reported per-operation rather than papered over:

| Construct | Native |
| --- | --- |
| Schemas: string/number/boolean, nested objects, arrays, optional/nullable, min/max/email/url/uuid/regex | lowers |
| `GET` with no path parameters | lowers |
| `GET` with a path parameter | **web-only** — PMTC bakes the URL at compile time; a runtime param cannot be baked |
| `POST`/`PUT`/`PATCH`/`DELETE` | **web-only** — mutations are not recognised yet |
| `enum` | narrowed to `s.string()` on the native path; the constraint is genuinely lost there |
| `date` / `date-time` | kept as strings on both paths, deliberately — `s.date()` does not lower, and parsing to a `Date` on web only would be a silent divergence |

A relative `baseUrl` (or a spec with no `servers`) makes **every** operation
web-only, because there is no absolute URL to bake. So does any `client` other
than `pyreon` — and that combination is refused at config time rather than
generating modules that lower to nothing.

## Config

```ts
// pyreon.config.ts
export default {
  lathe: {
    input: './openapi.yaml',
    output: './src/gen',
    target: 'multiplatform',
    // 'pyreon' (default) | 'fetch' | 'axios' | 'ky' — only pyreon reaches native.
    client: 'pyreon',
    plugins: ['schemas', 'client', 'queries', 'mocks', 'atlas'],
    strictNative: true,
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

### Pick only what you want

`plugins` is the whole emitter set; omit one and it does not run. Schemas alone
is a normal thing to want:

```ts
lathe: { input: './openapi.yaml', output: './src/schemas', plugins: ['schemas'] }
```

```bash
lathe generate --plugins schemas          # just s.* schemas + types
lathe generate --plugins schemas,mocks    # ...and deterministic fixtures
```

| plugin | emits | needs |
| --- | --- | --- |
| `types` | plain TypeScript types, no runtime | — |
| `schemas` | `@pyreon/validate` schemas + inferred types | — |
| `client` | the `createHttp` client + one endpoint per operation | `schemas` |
| `queries` | `useQuery` / `useMutation` hooks + `keys.ts` | `client` |
| `mocks` | route table for `@pyreon/http`'s mock middleware | `client` |
| `components` | one browsable preview per read operation | `queries` |
| `atlas` | workbench scenarios + wrapper | `components`, `mocks` |

The **needs** column is import edges in the emitted code, not preferences —
`queries/*.ts` imports `endpoints/*.ts`, `components.tsx` imports the hooks. A
selection is expanded to cover them rather than refused, and the report says
what came along:

```
plugins: components (+schemas, +client, +queries - required by them)
```

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

## The spec parser is first-party

There is no third-party OpenAPI or YAML dependency. The YAML reader is scoped
to the subset OpenAPI documents actually use and **refuses** anchors, merge
keys, explicit tags and tab indentation with a line number, rather than
producing a document that is subtly wrong everywhere the construct was used.

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
