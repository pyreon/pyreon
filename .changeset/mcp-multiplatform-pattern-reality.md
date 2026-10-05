---
"@pyreon/mcp": patch
---

Rewrite the bundled `multiplatform` pattern against the real capability matrix (first-party `@pyreon/charts` renders natively, `useQuery`/`useStream` lower natively while `useMutation`/`useInfiniteQuery` do not, the correct `get_api({ package, symbol })` shape) and add a reality test that cross-references every pattern's `@pyreon/*` packages, subpath imports and MCP tool names with the workspace and the real tool registry.
