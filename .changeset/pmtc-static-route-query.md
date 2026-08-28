---
'@pyreon/native-compiler': minor
---

A static route branch in the emitted router dispatch now compares the
query-STRIPPED path, as the dynamic branches already did through `matchPath`.

It used `path == "/settings"`, so writing any query param — `useUrlState`'s
`set` rewrites the stack top to `/settings?filter=done` — made every branch miss
and the screen render nothing. Reproduced on BOTH device gates: the page is
present before the write and gone after it, on iOS and Android alike.
