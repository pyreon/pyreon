---
'@pyreon/lathe': patch
'@pyreon/mcp': patch
---

chore(deps): clear five known advisories that were fixable within existing ranges

`bun audit` reported 7 advisories (4 high, 3 moderate) reachable from published
packages. Five are patch bumps inside the ranges already declared, so this is a
lockfile-only change:

- `js-yaml` 3.15.1 -> 3.15.2 and 4.3.1 -> 4.3.2 (2 high — `maxTotalMergeKeys`
  does not limit CPU use for empty merge sources). Reached via
  `@pyreon/lathe > gray-matter`, and via `@changesets/cli` on the dev side.
- `hono` 4.13.0 + 4.13.5 -> 4.13.7 (3 moderate — `toSSG()` path traversal,
  unbounded `parseBody()` nesting, query-parser cache-key differential).
  Reached via `@pyreon/mcp > @modelcontextprotocol/sdk > @hono/node-server`.

Two remain and are NOT fixable this way: `image-size` (2 high, DoS via infinite
loops in the ICNS and JXL/HEIF parsers) is fixed only above 2.0.2, and
`pptxgenjs@4.0.1` pins `^1.2.1`. Forcing it with an override would break that
declared range. Exposure is limited — `pptxgenjs` is an OPTIONAL peer of
`@pyreon/document`, so only consumers who opt into pptx export resolve it at all.
