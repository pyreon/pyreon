---
'@pyreon/lathe': minor
---

Reads more of the specs real APIs publish.

- **Swagger 2.0** is up-converted to OpenAPI 3.0 in process (definitions, body and `formData` parameters, `produces` / `consumes`, `securityDefinitions`, `host` / `basePath` / `schemes`, `x-nullable`, `collectionFormat`, discriminators) instead of refused; what 3.0 cannot spell is a `swagger2-lossy` note. Swagger 1.x is still refused.
- **Multi-file specs**: a `$ref` into another file is resolved against the spec's path and bundled — schemas become named models (stable names, cross-file cycles closed), everything else is inlined. `lathe pull` fetches and bundles a remote split spec, sending auth headers to the spec's origin only, with a per-document ETag cache. `--watch` and the Vite plugin regenerate on an edit to any referenced file.
- **Typed error responses**: 4xx / 5xx / range / `default` JSON bodies are declared on each endpoint; hooks type `error()` as `EndpointError<typeof op>`, and `err.matched === '404'` narrows `err.body`. Works on every client. `error-responses` now fires only for untypable (non-JSON) error bodies.
- **Webhooks and callbacks** are modelled (`IrDocument.webhooks`) and emitted as `webhooks.ts`: payload schemas plus `WebhookHandler<name>` types.
