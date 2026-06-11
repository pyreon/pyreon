---
'@pyreon/zero': patch
'@pyreon/router': patch
'@pyreon/server': patch
---

Server-loaders correctness fixes (adversarial review of the Phase 5 release):

- **`.server.tsx`/`.server.jsx` siblings now excluded from routes.** The exclusion regex matched only `.server.[jt]s`, so a `.server.tsx`/`.jsx` server-loader module silently shipped as a client route — violating the "never reaches the client bundle" guarantee. All four extensions are now excluded, and the sibling-detection probes all four.
- **Single-fetch no longer collides layout + page data.** The `/_pyreon/data` endpoint keyed loader data by `record.path`; a layout and its index page share a path, so the page's serverLoader data was silently overwritten by the layout's (timing-dependent, reproduced). The endpoint now runs ONLY serverLoaders (not isomorphic loaders — those run client-side; running them here double-fired their side effects) and keys by matched-chain index via the new `router.runServerLoaders(path, request)`.
- **Render gate** — `useLoaderData()` now resolves for server-loader routes (both RouterView render-gate branches already covered by a shared `carriesLoaderData` predicate from the Phase 5 fix; this PR adds the regression locks).

Also corrects two Phase 4 server-island docstrings that wrongly claimed zero's `startClient` auto-runs `activateServerIslands` (markers self-activate via a `ref`) and that the manual scan's cleanup aborts in-flight fetches (it doesn't — detached swaps are skipped via `isConnected`).
