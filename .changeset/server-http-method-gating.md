---
'@pyreon/server': minor
---

HTTP method gating + stream-mode 404 status + HEAD body-stripping (PR-S6)

Three correctness gaps in `createHandler`, all instances of Pattern B (incomplete HTTP semantics):

**1. No method gating.** The pre-fix handler ran the full render pipeline (loaders + SSR + scripts) against every HTTP method — POST / PUT / DELETE / PATCH bodies fell through to renderers that returned HTML and produced confusing 500s when the client expected JSON / 204 / 405. Now: after the middleware pipeline (so API routes / server actions / user middleware still handle their own non-GET methods), the gate rejects unknown methods. `OPTIONS` returns `204 No Content` + `Allow: GET, HEAD, OPTIONS` for fallback preflight; `POST`/`PUT`/`DELETE`/`PATCH` / etc. return `405 Method Not Allowed` + the same `Allow` header. **Loaders no longer fire on POST** — verified by a regression test that asserts `loaderFired === false` after a `POST` request.

**2. Stream mode hard-coded `status: 200`.** The L5 router-driven 404 path (PR L5) set `isNotFound: true` on `router.currentRoute()` when an unmatched URL resolved through the synthetic `notFoundComponent` chain; string mode read the flag and emitted `404`, but stream mode silently emitted `200`. Now: stream mode reads the same flag synchronously (before streaming starts — the flag is set by `router.resolve` in the per-request `createRouter` above) and threads it into `renderStreamResponse` as a `status` parameter (defaults to `200` for source-compatible callers).

**3. HEAD returned a full body.** Pre-fix `HEAD` ran the same render pipeline as `GET` and returned the body — wasteful for preflight cache probes and incorrect per HTTP spec. Now: the renderer still runs (loaders fire for preflight cache-warming), but `new Response(null, { status, headers })` short-circuits body production. Stream mode handles HEAD the same way — the stream is never connected to the response.

**Regression coverage**: 12 new tests across the `PR-S6 HTTP method gating` and `PR-S6 stream mode 404 status` describe blocks. Bisect-verified: reverting `handler.ts` fails 9 of 12 new tests (the 3 passes are baselines — GET status, middleware short-circuit before gate, stream-matched-URL status, all of which would pass either way).

**Middleware ordering preserved**: API routes, server actions, CORS preflight handlers, and user middleware ALL run BEFORE the method gate — so middleware that handles its own POST / OPTIONS / DELETE short-circuits with its own Response and the gate never fires. The gate is the FALLBACK for unhandled methods.

**No public API change**: the new `status` and `isHead` parameters on `renderStreamResponse` are internal (default to source-compatible values).
