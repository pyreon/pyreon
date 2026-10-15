---
'@pyreon/http': patch
---

Creating a client without `use` or `meta` no longer allocates an empty middleware array and meta object for it; those are shared, read-only values. `createHttp({ baseUrl, headers })` measured ~153 → ~118 ns, level with ofetch.
