---
"@pyreon/router": patch
"@pyreon/mcp": patch
---

docs(router): document 6 missing public exports in the manifest — `useNavigate`, `useParams`, `useValidatedSearch`, the `notFound`/`NotFoundBoundary` 404 pair, and `lazy`. `useNavigate`+`useParams` are two of the most-used router hooks framework-wide and had no api[] entry. All signatures, return shapes, and footguns are source-verified: `useNavigate` returns a `void`-typed pusher (drops the NavigationResult); `useParams` returns a string SNAPSHOT (not a live accessor); `useValidatedSearch` is an argument-less READ-ONLY accessor distinct from `useTypedSearchParams`/`useSearchParams`; `notFound()` throws a `Symbol.for('pyreon.notFound')`-branded error and `NotFoundBoundary` re-throws non-notFound errors; `lazy()` returns an inert descriptor cached by the router (not `lazy` itself). Regenerates the MCP api-reference + docs-site reference page.
