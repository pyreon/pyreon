---
'@pyreon/server': patch
---

`createHandler` (stream mode) now threads `req.signal` through to `renderToStream({ signal })` so an upstream `Request` abort (client disconnect, request timeout, parent AbortController) propagates end-to-end into the streaming render. Pending Suspense boundaries are cancelled, their post-resolve enqueues are skipped, and the response stream closes promptly — no wasted work after the consumer hangs up.

`renderToStream` already accepted `{ signal }` (shipped earlier), but `createHandler` was the missing one-line wire to make the AbortSignal story actually reach SSR users.

Bisect-verified: drop the signal forward → the new `threads request.signal through to renderToStream` test fails with both `'loaded-too-late'` and `__NS("pyreon-s-0",…)` present in the response HTML; restored → 1 pass × 5 stability runs, 167/167 server tests pass.
