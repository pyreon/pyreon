# lathe-bookshelf

A working app in which **nothing declares a URL, a method, a query key or a
response type**. All of it comes from [`openapi.yaml`](./openapi.yaml) through
`lathe generate`.

```bash
bun run gen     # regenerate src/gen from the spec
bun run dev     # http://localhost:5199
```

The API is served by Vite dev middleware (see `vite.config.ts`), so the whole
thing is one process and the requests are real HTTP — which is the point. A
mock transport would prove the components render while saying nothing about
whether the generated URL, method and decode are correct.

## What gets generated

| File | From |
| --- | --- |
| `src/gen/schemas.ts` | `components.schemas` → `s.object({…})` + inferred types |
| `src/gen/client.ts` | `servers[0].url` (overridden here) → `createHttp` |
| `src/gen/endpoints/*.ts` | one `api.endpoint('GET /books/:id', …)` per operation |
| `src/gen/queries/*.ts` | one `useQuery` / `useMutation` hook per operation |
| `src/gen/mocks.ts` | deterministic fixtures for `@pyreon/http`'s mock middleware |
| `src/gen/atlas.scenarios.ts` | one scenario per enum value, for the workbench |
| `src/gen/*.native.tsx` | self-contained per-tag modules for the native compiler |

## The multiplatform half

`pyreon.config.ts` sets `target: 'multiplatform'`, so `lathe generate` also
emits `books.native.tsx` / `authors.native.tsx` and then runs the **real**
`@pyreon/native-compiler` over them:

```
native reach  2/4 operations
  web-only 1 op(s): getBook
    path parameters (bookId) are supplied at runtime, and PMTC needs literal
    params to bake the URL at compile time.
  web-only 1 op(s): createBook
    POST lowers through mutations, which PMTC does not yet recognise.

lowers books.native.tsx swift   [PyreonQuery< PyreonZodSchema_ PyreonSchemaError]
lowers books.native.tsx kotlin  [PyreonQuery< PyreonZodSchema_ PyreonSchemaError]
```

Note the `baseUrl` override in `pyreon.config.ts` stays **absolute**. PMTC bakes
the request URL at compile time, so a relative base would make every operation
web-only — the native modules would still generate and would never lower.

## Two things worth knowing before reading `src/main.tsx`

Both were found by building this app, and both are noted at their call sites.

- **Query result fields are signals.** `books.data()`, not `books.data`. Reading
  the property without calling it yields the signal function, which is truthy —
  so `books.data ?? []` silently skips the fallback and `.length` reads the
  function's arity.
- **The detail title is deliberately not wrapped in `<Show>`.** An accessor
  mounted as a `<Show>` child updates once and then stops re-tracking, even
  while the Show's own condition is unchanged. Reproduced against a
  hand-written query too, so it is a framework behaviour rather than anything
  about generated code.
