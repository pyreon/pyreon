---
'@pyreon/feature': minor
'@pyreon/lint': patch
---

`@pyreon/feature` now forwards TanStack's `AbortSignal`, so query cancellation works.

Every read hook (`useList`, `useById`, `useSearch`) called its REST layer as `queryFn: () => http.getById(api, id)`. That signature took no `AbortSignal`, so the per-fetch signal TanStack aborts on unmount, on supersede and on `cancelQueries` never reached the network — cancellation has been silently dead for every feature-driven query since the package shipped. An unmounted component kept fetching, and a rapidly-retyped search fired one request per keystroke, all of which ran to completion and raced each other into the cache, so the last response to arrive won rather than the newest.

The REST layer now runs on `@pyreon/http` and threads `{ signal }` through all three hooks. Two further defects go with it: path parameters are URL-encoded, so an id containing `/` can no longer escape its segment (`1/../admin` reaching `/admin`), and requests get a 30s deadline where raw `fetch` had none.

The thrown error shape is deliberately unchanged — `message` from the response body when present, else `<METHOD> <url> failed: <status>`, plus `status`, plus `errors` only when the body carries them. Migrating the transport must not silently re-shape what consumers catch, so the client runs with `throwHttpErrors: false` and the original extraction is preserved verbatim. `config.fetcher` remains a plain `typeof fetch`.

`pyreon/query-fn-must-forward-signal` also gains a false-positive fix: it scanned only the function body, so a correct `queryFn: ({ signal: abortSignal }) => …` — where `signal` appears only in the parameter pattern — was reported as a violation. It now scans parameters too.
