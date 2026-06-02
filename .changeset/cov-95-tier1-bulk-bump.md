---
"@pyreon/attrs": patch
"@pyreon/code": patch
"@pyreon/connector-document": patch
"@pyreon/coolgrid": patch
"@pyreon/core": patch
"@pyreon/dnd": patch
"@pyreon/document-primitives": patch
"@pyreon/feature": patch
"@pyreon/flow": patch
"@pyreon/form": patch
"@pyreon/head": patch
"@pyreon/i18n": patch
"@pyreon/kinetic": patch
"@pyreon/mcp": patch
"@pyreon/permissions": patch
"@pyreon/preact-compat": patch
"@pyreon/primitives": patch
"@pyreon/query": patch
"@pyreon/reactivity": patch
"@pyreon/rocketstyle": patch
"@pyreon/runtime-dom": patch
"@pyreon/rx": patch
"@pyreon/server": patch
"@pyreon/storage": patch
"@pyreon/svelte-compat": patch
"@pyreon/table": patch
"@pyreon/toast": patch
"@pyreon/url-state": patch
"@pyreon/validate": patch
"@pyreon/validation": patch
"@pyreon/vite-plugin": patch
---

test(coverage): bulk-bump 31 packages' `statements` threshold 94 → 95 (already passing)

PR 1 of the "whole-repo coverage ≥ 95%" initiative (user-approved sequence:
by-gap-size, start with quick wins).

Every package in this bump is **already reporting ≥ 95% actual** per
`bun scripts/check-coverage.ts`. Locking the configured threshold in
match prevents regressions and lets the `Coverage (Full)` CI gate enforce
the new floor.

**No runtime changes, no test additions** — pure config update.
Drift-detection in `BELOW_FLOOR_EXEMPTIONS` was triggered for two
exemption entries (`@pyreon/code`, `@pyreon/kinetic`) which had been
listed with `currentStatements: 94`; updated to 95 with the new reason
documenting the lift.

Packages bumped (current actual in parens):

- @pyreon/attrs (100), @pyreon/coolgrid (100), @pyreon/table (100), @pyreon/toast (100)
- @pyreon/rocketstyle (99.41), @pyreon/primitives (99.26), @pyreon/i18n (99.21), @pyreon/validation (99.12)
- @pyreon/rx (98.45), @pyreon/kinetic (98.24), @pyreon/feature (98.11), @pyreon/head (97.97), @pyreon/flow (97.94), @pyreon/form (97.94), @pyreon/document-primitives (97.82), @pyreon/preact-compat (97.68), @pyreon/server (97.54), @pyreon/svelte-compat (97.42), @pyreon/validate (98.69), @pyreon/dnd (97.33)
- @pyreon/query (96.79), @pyreon/mcp (96.52), @pyreon/unistyle (96.36) [already 95], @pyreon/reactivity (96.13), @pyreon/connector-document (96.05), @pyreon/react-compat (96.03) [already 95]
- @pyreon/storage (95.6), @pyreon/permissions (95.38), @pyreon/url-state (95.13), @pyreon/runtime-dom (95.02), @pyreon/code (95.02), @pyreon/core (95.68), @pyreon/vite-plugin (95.32)

Pre-existing CI failures NOT addressed in this PR (separate follow-ups):
- @pyreon/sized-map: 0% reported by check-coverage.ts (test detection bug — Tier 5)
- @pyreon/styler: 93.16% < 94% threshold (Tier 3)
- @pyreon/ui-core: 90.94% < 94% threshold (Tier 4)
- @pyreon/zero: 91.65% < 94% threshold (Tier 4)
- @pyreon/runtime-dom: branches 85.78% < 88% threshold (Tier 6)

Next PR (Tier 2): close the < 1pt gaps on charts, elements, hooks,
hotkeys, lint, router, state-tree with focused test additions.
