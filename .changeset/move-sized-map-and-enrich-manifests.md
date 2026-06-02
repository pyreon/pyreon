---
"@pyreon/sized-map": patch
"@pyreon/feature": patch
"@pyreon/mcp": patch
"@pyreon/storage": patch
---

chore: move @pyreon/sized-map to packages/core/ + enrich mcp/feature/storage manifests

**@pyreon/sized-map** — package moved from `packages/internals/` to `packages/core/`
alongside the other foundational primitives every Pyreon package depends on. The
package is now published to npm at 0.27.1 with OIDC trusted publishing, so the
"internal-by-convention" location no longer fits. Updated:

- `repository.directory` in package.json → `packages/core/sized-map`
- `bun.lock` workspace dep entry rewritten

Zero source/runtime changes — every consumer imports `@pyreon/sized-map` by package
name, never by path. This is a path-only repackage; the published artifact is
byte-identical.

**@pyreon/feature** — manifest enriched from 2 → 5 api[] entries:

- Added `isReference`, `extractFields`, `defaultInitialValues` (helpers exported
  from the package but not in the MCP `get_api` surface before this PR)
- Added `mistakes[]` to the existing `reference()` entry

`get_api({ package: 'feature', symbol: 'extractFields' })` now returns a real
entry instead of 404. No runtime change.

**@pyreon/mcp** — manifest enriched: 9 of 14 tool entries lacked `mistakes[]`.
Added foot-gun catalogs for `get_api`, `validate`, `migrate_react`, `get_routes`,
`get_components`, `get_pattern`, `get_changelog`, `audit_test_environment`,
`audit_islands`. All 14 tools now have 3-4 documented mistakes grounded in real
failure modes. No runtime change.

**@pyreon/storage** — manifest enriched from 4 → 7 api[] entries:

- Added `useSessionStorage`, `useMemoryStorage`, `setCookieSource` (helpers exported
  but not in the MCP `get_api` surface before this PR)
- Added `mistakes[]` to existing `useCookie`, `useIndexedDB`, `createStorage`
  entries (e.g. cookie maxAge unit traps, IDB async-init flash-of-default, custom
  backend `undefined` vs `null` return contract)

No runtime change.
