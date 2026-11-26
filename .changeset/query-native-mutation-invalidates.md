---
'@pyreon/query': minor
---

`useMutation(ep.mutation({ invalidates: [listX, getX] }))` now invalidates natively too; before, `invalidates` was reported as ignored on iOS and Android.
- Each target, which must be a same-file `GET` endpoint, lowers to a URL root: `GET:` plus its URL up to its first path parameter.
- A successful mutation settles through `PyreonQueryCache.settleMutation` for each root, so live queries under it refetch, as `invalidateQueries` does on the web.

`PyreonQueryCache` key roots (Swift and Kotlin) now also cover a key that continues the root with `/` (a path below a URL root, so `GET:https://h/books` covers `…/books/1`) or `?` (its query strings), in addition to `:`.
- Matching stays segment-safe: `/books` never covers `/bookshelf`.
- `MutateQueryEffects.invalidates` accepts several roots.
