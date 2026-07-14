---
"@pyreon/router": patch
"@pyreon/mcp": patch
---

docs(router): source-verified `mistakes[]` foot-gun catalogs added to the flagship
APIs that had none — RouterView, useLoaderData, useRoute, useSearchParams,
onBeforeRouteLeave. Every entry verified against the worktree source: RouterView's
SSR-blank-on-lazy (`prefetchLoaderData` runs loaders only; the handler must also
`router.preload`), the single atomic `depthEntry` computed (param changes don't
remount the layout), useLoaderData's non-reactive context read + per-depth
provider, useRoute's accessor/destructure trap, useSearchParams' tuple shape, and
the guard return-value inversion vs useBlocker (guard `false`=cancel/string=redirect
vs blocker `true`=block — confirmed at router.ts:756-757). Regenerates the MCP
api-reference router region. Docs/manifest only — no runtime behavior change.
