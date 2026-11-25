---
'@pyreon/lathe': minor
---

`responseValidation: 'off'` at generate time now declares those endpoints types only (#4815).
- The response, error and stream-event bodies are typed from the model interfaces (`api.endpoint<'GET /items', (raw: unknown) => Items, …>`), every model is an `import type`, and no schema is referenced.
- So neither the schema modules nor `@pyreon/validate` (or zod) ship with those endpoints: one `GET` over a nested response went from 21.9 KB to 6.8 KB gzipped.
- Error bodies keep `err.matched`: each declared status maps to the identity `unchecked` exported from the generated `client.ts`.
- `operations.<id>.responseValidation: 'off'` does the same for one operation. A per-operation `'strict'` or `'warn'` on an `'off'` project keeps its schemas.
- For `'strict'` and `'warn'` nothing changes, including `configureApi({ validate })` switching modes at runtime.

Writes reach native (#4835). With `target: 'multiplatform'`, a `POST` / `PUT` / `PATCH` / `DELETE` with a JSON body (or none) and a typed JSON response (or no content) gets an `<Op>Mutation` component in its tag's `.native.tsx` module.
- The component is `useMutation<T, E, Vars>(op.mutation({ invalidates }))`, which `@pyreon/query`'s native plugin lowers to the `PyreonMutation` runtime.
- `children(mutate, data, isPending, error)` receives the trigger (`data` only when the response is typed). Path parameters and the body are props, read when `mutate` is called.
- A successful write refreshes the same queries as the web hook (`useCreateX`), on the web and natively. Natively each target is a URL root that also covers the paths below it. Only targets in the operation's own tag can be named, because the native module is one file.
- The reach report counts these writes as reaching native. A write that cannot be lowered names the reason: a non-JSON body or response, a required query, header or cookie parameter, a path parameter named `json` or `children`, or `hook: false`.
- The stale "PMTC does not yet recognise mutations" reason is gone, and the native verifier expects `PyreonMutation<` wherever a module uses `useMutation`.

A native data component now sends a `GET`'s required query parameters (#4835).
- Each one is a prop, sent as `query`. It used to pass path parameters only, so the module lowered and was reported `web+native` while every native request left the parameter out.
- A required query parameter that is not a scalar or not a plain identifier, or a required header or cookie parameter, leaves that read `web-only` with the reason.
- The generated components' locals are now `__q` / `__m` / `__s`, so a parameter named `q` no longer collides with them on Swift.

Every generated read hook takes the same `args` accessor first (#4841).
- It is optional for an operation without parameters, so `useListThings(() => ({ meta, headers, timeout }))` sends them with the request. Returning `undefined` holds the request, as on a hook with parameters.
- Query options move to the second argument, which now also takes `key: (base) => [...base, discriminator]` to extend the cache key. Start from `base`, so invalidating the endpoint still matches.
- `key` is also accepted by the factories a loader prefetches with: `op.query(args, { key })` and `<op>InfiniteOptions(args, { key })`. A prefetch therefore lands where a hook with an extended key reads.
- A held query (args returned `undefined`) is cached under `[...prefix, { held: true }]`, a key no request produces. It used to share the bare prefix with a live call that has no arguments. TanStack keeps one query per key and the last observer's options win, so a held hook mounted beside a live `useListThings()` gave the live one its disabled fetcher, and an invalidation then failed it with "query is disabled".

Breaking:

- A hook for an operation without parameters took its query options first. Pass them second, for example `useListThings(undefined, () => ({ staleTime }))`.
  - An inline literal of query options in the first position is now a type error.
  - An options object that is not a literal still compiles, and its query options (`staleTime`, `enabled`, `select`, …) no longer take effect. The hook names them in a one-time `console.warn`.
  - `meta` is valid in both positions, so it compiles silently. In the first position it is now the REQUEST's meta (what a middleware reads), not TanStack's query meta. Move a query `meta` to the second argument.
- With `responseValidation: 'off'` at generate time, `configureApi({ validate: 'strict' })` has no schema to check those endpoints against. Generate with `'strict'` or `'warn'` to keep the runtime switch.
