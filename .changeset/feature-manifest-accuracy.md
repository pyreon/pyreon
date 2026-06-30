---
"@pyreon/feature": patch
---

Correct `@pyreon/feature` API docs (manifest feeding `llms.txt`, `llms-full.txt`, and MCP `get_api`). The manifest had drifted from the source and documented an API that never existed: a string-map `schema`, an object `api: { baseUrl }` with phantom per-endpoint overrides, string `reference('users')`, and wrong hook shapes. Now source-accurate (verified against the integration tests):

- `schema` is a real Zod / Valibot / ArkType validator (`z.object({ … })`), not a string map; `TValues` is inferred from it.
- `api` is a plain string base path (e.g. `/api/posts`); REST endpoints are derived from it (`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`) — there are no `listUrl`/`getUrl`/etc. override fields.
- `reference({ name })` takes a Feature object or `{ name }`, not a string.
- `useList({ page, pageSize })` (`data()` is `T[]`, not `{ items }`), `useSearch(signal)` (a `Signal`, not an accessor), `useForm({ mode, id })` returning a `FormState` (`register`/`handleSubmit`/`isSubmitting`), `useTable(data, options)` (data first), `useCreate().mutate(…)` + `isPending()`, and `useStore()` exposing state on `.store`.

No runtime change — docs/metadata only.
