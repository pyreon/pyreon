---
'@pyreon/native-compiler': minor
---

A static route branch in the emitted router dispatch now resolves through the
router's own `matchPath`, exactly as the dynamic branches already did, instead
of comparing the current path against the route pattern.

It used `path == "/settings"`, so writing any query param — `useUrlState`'s
`set` rewrites the stack top to `/settings?filter=done` — made every branch miss
and the screen render nothing. Reproduced on BOTH device gates: the page is
present before the write and gone after it, on iOS and Android alike, with the
Android run rendering the router's own `no route for /settings?filter=done`.

Stripping the query before comparing would fix that shape and leave the class
open: a comparison still disagrees with `matchPath` on a trailing slash
(`/settings/`) and on empty segments (`//settings`), both of which are
documented `matchPath` behaviour locked by the runtime suites on both targets.
Sharing the one matcher means every normalization rule — including any added
later — applies to static and dynamic routes alike.
