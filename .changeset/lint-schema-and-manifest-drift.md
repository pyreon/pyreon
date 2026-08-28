---
'@pyreon/lint': patch
---

The config schema now lists every rule group, and both it and the manifest's
per-group counts are gated against the registry.

Two hand-maintained surfaces had rotted, neither checked by anything:

- `schema/pyreonlintrc.schema.json` knew FOUR of the ten groups, with
  `additionalProperties: false`. So `groups: { portable: 'warn' }` — the line
  that enables the native tier for a multiplatform app — validated as an
  invalid key in every editor while working perfectly at runtime. That is the
  worse direction for a schema to be wrong in: the config is correct and the
  tool says it is not, which teaches people to delete working configuration.
- `manifest.ts` claimed the `pyreon` group held 51 rules against an actual 52,
  and had done before this session's work. Those counts render verbatim into
  the docs site, `llms.txt` and the MCP api-reference, so the number an AI
  assistant reads back was simply wrong.

`check-doc-claims` locks the TOTAL rule count; nothing locked the split or the
schema. `registry-drift.test.ts` now does both, in BOTH directions — a count
that drifted and a group the manifest still names after the registry dropped
it — and is bisect-verified five ways. Its own first draft matched every group except `a11y`, because
`[a-z-]` cannot match a name with digits in it — a hole shaped exactly like the
ones the file exists to catch, which is why the widened class is commented.
