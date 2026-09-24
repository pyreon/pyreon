---
'@pyreon/http': minor
---

Endpoint paths: `\:` now writes a LITERAL colon, for paths such as Google-style custom verbs (`'POST /v1/:name\\:cancel'`). Without it an unescaped `:cancel` read as a second parameter the caller could never supply. The type-level `PathParamNames` now mirrors the runtime matcher exactly: it honours the escape, stops a parameter name at the first non-identifier character (`/f/:name.json`, `/f/:a-:b`), and finds parameters that do not start their segment (`/f/file:id`) — all shapes where the type and the runtime used to disagree.

Query parameters: an OBJECT value is now serialized with bracket keys (`filter[status]=open`) instead of `filter=[object Object]`, and its type is accepted (`QueryObject`). Endpoints can declare OpenAPI's serialization per key with `queryStyle` (`form` / `spaceDelimited` / `pipeDelimited` / `deepObject`, `explode`), e.g. `api.endpoint('GET /search', { queryStyle: { ids: { style: 'form', explode: false } } })` sends `ids=1,2`. `buildQuery` / `buildUrl` take the styles as an optional last argument. New exported types: `QueryStyle`, `QueryObject`, `QueryScalar`.

Endpoints: `responseType` (`'text' | 'blob' | 'arrayBuffer' | 'stream' | 'void'`, default `'json'`) decodes non-JSON bodies and types the resolved value accordingly (`BodyOf`). A third generic narrows what a call sends — `api.endpoint<'POST /pets', typeof Pet, { json: NewPet }>(…)` makes a direct call as strictly typed as a hook (new `EndpointInput` / `EndpointCallOptions` types; `EndpointArgs` is their intersection, unchanged). `keyScope` (on `createHttp` or per endpoint) namespaces cache keys as `[keyScope, method, path, …]`, so two clients sharing a `QueryClient` no longer share `GET /users`.
