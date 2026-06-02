---
"@pyreon/lint": minor
"@pyreon/mcp": patch
---

feat(lint): `pyreon/heading-order` rule — flag skipped heading levels (a11y)

New opt-in frontend accessibility rule. Flags a heading whose level jumps by
more than one from the previous heading in the same scope (e.g. `<h1>` followed
by `<h3>`, skipping `<h2>`) — the axe-core "heading-order" check. Screen-reader
users navigate by the heading outline; skipped levels break it.

**Function-scoped** so two sibling components in one file each get their own
outline (no false positive when component B opens at `<h3>` after component A
ended at `<h1>`). Off in `recommended`/`strict`/`app`/`lib`; on in
`best-practices`. (87 rules total; frontend category 7 → 8.)

Limitations (the "80% case"): only literal `<h1>`–`<h6>` in a single file's
source order; dynamic-level components (`<Heading level={n}>`) and
cross-component document order are out of reach for a static walker.
`@pyreon/mcp` api-reference regenerated from the updated manifest.
