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
web-only, because there is no absolute URL to bake.

## Config

```ts
// pyreon.config.ts
export default {
  lathe: {
    input: './openapi.yaml',
    output: './src/gen',
    target: 'multiplatform',
    plugins: ['schemas', 'client', 'queries', 'mocks', 'atlas'],
    strictNative: true,
  },
}
```

`lathe check` regenerates in memory and fails when committed output has drifted
from the spec — the CI half, same contract as `gen-docs --check`.

## The spec parser is first-party

There is no third-party OpenAPI or YAML dependency. The YAML reader is scoped
to the subset OpenAPI documents actually use and **refuses** anchors, merge
keys, explicit tags and tab indentation with a line number, rather than
producing a document that is subtly wrong everywhere the construct was used.
