---
"@pyreon/cli": patch
---

Consolidate the `doc-claims` gate's CLAUDE.md claim sites to one per count.

CLAUDE.md was compressed from a per-PR engineering changelog (~2000 lines) down to a lean reference (~330 lines), keeping every durable contract/convention/gotcha + the package tables but cutting per-PR narratives, bisect details, and Phase sagas. As part of that, each gated numeric claim (hook count, lint rule count, lint category count, document output-format count) now lives in ONE CLAUDE.md site — the package-overview table rows + the summary line — instead of being re-quoted in 2–3 redundant per-category bullets / API-description sentences. The `doc-claims` gate's stale claim patterns for those removed sentences are dropped (the table-row patterns still verify each count); the gate now scans 25 claim sites (was 31), still drift-free. No consumer impact — the gate's `actual` functions read Pyreon-monorepo paths that don't exist in a consumer project.
