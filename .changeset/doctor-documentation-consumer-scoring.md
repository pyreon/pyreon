---
"@pyreon/cli": patch
---

Fix `pyreon doctor` scoring a consumer app a misleading `C` (75/100). The `doc-claims` gate (the "documentation" category) validates the Pyreon **monorepo's own** doc-claim numbers (hook counts, lint-rule counts, …) against framework-internal source files — meaningless in a downstream consumer, where those paths don't exist, so it flooded the category with `file-missing` errors and dragged an otherwise-clean project's grade. It now detects it's outside the monorepo (via the absence of `scripts/check-doc-claims.ts`) and returns **N/A (skipped, excluded from the composite score)** instead of 0. In-monorepo behavior is unchanged.
