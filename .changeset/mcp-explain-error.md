---
'@pyreon/mcp': minor
---

New `explain_error` MCP tool — assembles a structured failure dossier from a full Pyreon error report.

The rich-context sibling of `diagnose`. `diagnose` matches an error *string* against known footguns; `explain_error` takes a full `ErrorContext`-shaped report — crucially the **`reactiveTrace`** (the causal sequence of signal writes from `@pyreon/core`'s error reports) — and assembles:

- The **reactive run-up** (the write sequence, oldest → newest)
- **Heuristic findings** over that sequence: `empty-trace` (crash is NOT state-driven — don't chase a reactive bug), `last-write-correlation` (the write whose signal name is in the error message), `nullish-then-crash` (a signal set null/undefined that the error references), `write-storm` (same signal written past a loop threshold), `type-flip` (value shape changed: `Array(3)` → `null`)
- Optional **static detection** (`detectPyreonPatterns` / `detectReactPatterns`) when the component source is supplied
- **Correlated anti-pattern catalogue** entries (matched via the finding → detector-code mapping, reusing the `get_anti_patterns` loader)

```ts
explain_error({ report: JSON.stringify(errorContext) })
// errorContext captured via registerErrorHandler(ctx => …) in dev
```

**Architecture (deliberate):** the server only *assembles* + applies cheap heuristics — it does not call an LLM, hold API keys, or mutate anything. The consuming agent reasons over the dossier; a human gates any patch *by construction* (the tool returns text only, no write capability). This is the sound, distinctive core of "AI-native self-healing" — self-*explaining*, not autonomous-repairing. The rejected idea (autonomous in-production repair) is structurally impossible here.

**Why Pyreon can do this and incumbents can't:** the dossier's highest-signal section is the reactive write sequence — *how* the app reached the failing state, which a stack trace alone can't show. That input only exists because of `@pyreon/core`'s `reactiveTrace` (companion PR #598). `explain_error` does not import #598 — it parses the serialized shape structurally, so it works standalone and gets more useful once apps capture real reactive traces.

Bisect-verified: disabling the `last-write-correlation` heuristic fails the `explain-error-server.test.ts > assembles a dossier` round-trip; restored → 24 tests pass (19 unit + 5 JSON-RPC). No `TEMP BISECT` remnant. Full `@pyreon/mcp` suite: 473 pass. Manifest-driven — `mcp_overview` + `api-reference.ts` + `llms-full.txt` + `docs/docs/mcp.md` regenerate from the new manifest entry; `gen-docs --check` clean; manifest-snapshot key list updated.
