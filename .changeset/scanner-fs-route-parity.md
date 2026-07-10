---
'@pyreon/compiler': minor
'@pyreon/zero': patch
'@pyreon/vite-plugin': patch
---

Single-source the zero fs-route convention + island-name derivation — the project scanner reports what zero actually serves.

`@pyreon/compiler`'s project scanner (`generateContext` — behind `pyreon context` and the MCP `get_routes`/`get_components` tools) carried comment-synced copies of `@pyreon/zero`'s fs-route functions that had diverged at birth: it accepted `api/` at ANY depth (zero's `isApiRoute` requires the top-level `api/` prefix, so a nested `posts/api/x.ts` was reported as an API route zero never serves), invented API routes for method-handler `.ts` files outside `api/` (zero registers those as page routes), and reported auto-named islands under their bare binding name (`Widget`) instead of the actual registry name (`Widget$<fnv1a6(relPath)>`).

The convention now has ONE home:

- New pure subpath `@pyreon/compiler/fs-route-convention` — `filePathToUrlPath`, `isApiRoute`, `apiFilePathToPattern`, `ROUTE_EXTENSIONS`, `SPECIAL_ROUTE_FILES`, `stripRouteExtension` (byte-behavior-identical ports of zero's originals; no `typescript` cold-load). `@pyreon/zero`'s `fs-router.ts`/`api-routes.ts` re-export it; identity parity tests lock against a local copy ever being reintroduced.
- New `@pyreon/compiler` exports `deriveIslandName` / `fnv1a6` / `islandRelPath` — the island auto-name derivation, re-exported by `@pyreon/vite-plugin`'s `island-auto-name.ts` (identity-locked) and used by the scanner so reported island names match the hydration registry.
- Scanner fixes: nested `<dir>/api/*.ts` and method-handler `.ts` outside `api/` are reported as page routes (zero parity); auto-named islands carry the derived registry name; a bindingless nameless `island()`'s basename fallback is documented as a placeholder, not a registry name.
