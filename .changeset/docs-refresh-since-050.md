---
'@pyreon/mcp': minor
'@pyreon/cli': minor
---

**`get_api` now answers for `@pyreon/a11y` and `@pyreon/rich-text`.** Both had manifests and ZERO api-reference entries, so an agent asking about them got nothing — 53 packages were served, not 56. A manifest is the docs pipeline's INPUT; an api-reference entry is what an agent can retrieve, and nothing connected the two. Adding their marker pairs generates 7 and 3 symbols respectively from the manifests they already had.

`check-mcp-docs` now gates that: a package with a manifest that `get_api` cannot answer for is a failure, with the marker-pair fix printed. It checks reachable KEYS rather than markers, because a package may legitimately be served by hand-written entries (`@pyreon/i18n` is) and demanding a marker would force a migration the pipeline makes optional.

**`check-doc-claims` gained 7 claim sites (23 → 30)**, covering counts that had rotted precisely because nothing watched them: the MCP tool count (CLAUDE.md said 18, actual 19), manifest coverage ("52 of 65 published packages", actual 56 of 75), the manifest-exempt count (13, actual 19 — the six `native-*` packages joined the list), and three claims in `@pyreon/primitives`' README.
