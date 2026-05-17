---
'@pyreon/mcp': minor
---

Cut MCP consumer token cost — `get_anti_patterns` default ≈76% smaller, plus a per-session-tax trim and a regression gate.

**Measured** (≈4 chars/token; reproducible via `src/tests/token-budget.test.ts`):

| surface | before | after | delta |
|---|---:|---:|---:|
| `get_anti_patterns({})` (the common orient call) | 13,976 | 3,292 | **−76%** |
| `tools/list` (paid by every consumer, every session) | 1,228 | 1,097 | −11% |
| `diagnose` schema (in `tools/list`) | 280 | 212 | −24% |
| blended working session* | ~17,440 | ~6,620 | **−62%** |

\* tools/list + mcp_overview + 2×get_api + one `get_anti_patterns({})`.

**`get_anti_patterns` is now token-frugal by default:**

- **no args → a COMPACT INDEX** — one line per entry (title + `[detector: <code>]` tag + one-sentence hook). Keeps the per-category `## <Heading>` markers so an agent still discovers categories in one call; only the prose body is elided.
- `{ name }` → the single matching entry's full body (cheapest drill-in).
- `{ category }` → that category's full bodies — **unchanged contract** (the existing filtered tests pass untouched).
- `{ full: true }` → the entire catalog (≈14K), explicit expensive opt-in.

The old behaviour (no-arg = full dump) was the bloat: an agent calling `get_anti_patterns()` to orient itself ate ~14K tokens to read every full body when it needed the map plus one or two entries. That call is now ~3.3K and the full bodies are one deliberate call away.

**Per-session tax trim:** schema `.describe()` strings ship in `tools/list` to every consumer on every connection whether or not the tool is ever called. The verbose prose (including the `diagnose` describes I over-wrote in #600) is trimmed to terse one-liners; the full param semantics live in the manifest, served on demand via `get_api` / `mcp_overview`. Honest note: this lever is smaller than I estimated — the JSON-Schema *structure* (param names, types, the nested `reactiveTrace` shape) dominates `tools/list`, not description text — so it's −11%, not the ~40% I projected.

**Regression gate:** `src/tests/token-budget.test.ts` stands up the real client↔server (in-memory JSON-RPC, the MCP e2e shape) and pins `tools/list` < 1,300 tokens, `get_anti_patterns({})` < 5,000, the index ≥60% smaller than `full`, and `{ name }` cheaper than the index. Bisect-verified: reverting the default to the old full dump fails 4 of these; restored → all pass, no remnant. Budgets sit above the post-PR numbers with head-room so normal catalog growth doesn't trip them — it's a ratchet against re-bloat, not a snapshot.

No capability lost: every full body is still reachable, just behind an explicit, intentional call instead of being the default firehose. `@pyreon/mcp` suite: 473 tests pass (7 new: 4 token-budget + 3 drill-in paths). gen-docs in sync (manifest entry rewritten, api-reference regenerated).
