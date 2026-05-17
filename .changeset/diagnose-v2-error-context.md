---
'@pyreon/mcp': minor
---

`diagnose` MCP tool v2 — structured-context enrichment (backward-compatible).

The original `diagnose` took only an error string and matched it against a fixed regex table. That's the "known error message → canned fix" tier — it can't reason about *why* the app reached the bad state because it never sees the component or the reactive run-up.

v2 keeps the string-only path **byte-identical** (verified — every existing `diagnose` test passes unchanged) and adds optional structured context:

- **`componentSource`** → runs `detectPyreonPatterns` over it and maps each hit to the documented `.claude/rules/anti-patterns.md` entry via the `AntiPatternEntry.detectorCodes` bridge. The agent gets "here's the static foot-gun in this component + its catalog explanation," not just the raw error.
- **`reactiveTrace`** → the causal sequence of signal writes leading to the crash (`ErrorContext.reactiveTrace` from `@pyreon/core`, shipped #598). Formatted as a chronological run-up.
- `filename` / `phase` — optional hints.

Architecture: the tool is **deterministic and embeds no LLM**. An MCP tool's job is to assemble the richest structured failure context; the agent calling it does the reasoning. This removes model/prompt risk from the framework entirely and keeps the enrichment unit-testable. The pure `enrichDiagnosis(input, deps)` function takes injected dependencies (detector + parsed anti-patterns) so it has no filesystem/server coupling.

Backward compatibility is a hard contract, not a hope: when no structured context is supplied, `contextLevel` is `'string-only'` and `formatEnrichedDiagnosis` returns exactly the v1 block (the "Could not identify…" fallback or the `**Cause:** / **Fix:** / **Code:** / **Related:**` block). The enrichment sections are appended *only* when `componentSource` / `reactiveTrace` are present.

When structured context is supplied but yields nothing (clean component, empty trace) the tool says so explicitly ("no additional findings") rather than implying the base diagnosis is enriched — honest about its own confidence.

Bisect-verified: forcing `hasStructuredContext = false` made all 7 v2 tests fail while all 14 v1/string-only tests still passed (proving backward-compat is structural, not coincidental); restored → 21/21 pass, no remnant.

Pairs with #598 — `reactiveTrace` is the input that makes causal diagnosis possible; this is the consumer of that substrate, sequenced as a separate PR (same #585→#587 layering).
