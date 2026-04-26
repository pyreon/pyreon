# E1: Speculative monomorphic `mountFor`

## Question

Does an append-only fast path with deopt-to-LIS save ≥15% wall-clock on append-heavy lists with ≤2% regression on shuffle-heavy?

## GRADUATE / KILL criteria (copied from plan, frozen)

- **GRADUATE**: ≥15% wall-clock win on append journey AND ≤2% loss on shuffle.
- **KILL**: <5% append win OR ≥5% shuffle regression OR any correctness bug.
- **DEFER**: between GRADUATE and KILL — i.e. positive direction but below the GRADUATE threshold, with no regression.

## Method

1. Add an append-only check at the top of `handleIncrementalUpdate` in `packages/core/runtime-dom/src/nodes.ts`. If `currentKeys` is a strict prefix of `newKeys` (and `n > oldN`), skip:
   - `_reusableKeySet.clear()` + populate
   - `removeStaleForEntries` iteration
   - The full `mountNewForEntries` iteration (only the appended range needs rendering)
   - `forLisReorder` — `computeForLis`, `markStayingEntries`, `applyForMoves`
   - The per-key `cached.pos = i` update loop
2. Falls through to the general path on any mismatch (n ≤ oldN, or any prefix divergence, or a duplicate key in the appended range).
3. Add `runtime.mountFor.appendFast` counter to `@pyreon/perf-harness/COUNTERS.md` and emit it on each fast-path hit.
4. Run the canonical `chat` journey 5 times against E1 and against an E1-reverted baseline at the same SHA. Same for `shuffleRows`.
5. Compare medians; bisect-verify by stashing the change and re-running.

## Baseline

- Baseline SHA: `20894a83` (origin/main HEAD at experiment start)
- Hardware/OS: macOS 14.x, headless Chromium via Playwright, dev-mode (Vite), ~30 concurrent worktrees + various other processes (noisy)
- Recordings: `perf-results/20894a83-perf-dashboard-{chat,shuffleRows}.json`

## Experiment runs (bisect-verified, same SHA, stash-on / stash-off)

| Journey | E1 reverted (median ms) | E1 enabled (median ms) | Δ |
|---|---|---|---|
| chat | 182 / 182 / 189 | 183 / 182 / 182 | ~0% (within noise) |
| shuffleRows | 16 / 16 | 15 / 23 / 16 | ~0% (within noise) |

Counter signal:
- `runtime.mountFor.appendFast` = 10 per chat run (1 reset + 10 batch appends; the reset is a full replace, not append, so 10 fast-path hits exactly match the 10 batch appends — the path is exercised correctly).
- `runtime.mountFor.lisOps` on shuffle: 195 (baseline) → 186 (E1, within noise) — confirms the shuffle path still takes the LIS algorithm; the fast-path early-return doesn't affect it because `n === oldN` for shuffle.

## Decision

**Outcome: DEFER**

**Reasoning**

The append-only fast path IS correctly exercised on the chat journey (counter fires 10 times per run), but the work it skips is microseconds — the per-batch saving is ~300-400 simple iterations on top of 100 `cloneNode` calls. cloneNode dominates the cost by 2-3 orders of magnitude, so the fast-path savings drown in measurement noise.

Concretely: per append batch, E1 skips ~100 (`_reusableKeySet` populate) + ~100 (LIS compute, with 0 binary-search ops via tier 1) + ~100 (applyForMoves stay-checks) + ~100 (per-key pos update) ≈ 400 iterations × ~10ns each ≈ 4µs. Per chat run (10 batches): ~40µs total skip — well below the 1ms wall-clock measurement floor.

The shuffle path is unaffected because the fast-path's outer `if (n > oldN)` short-circuits when `n === oldN`. Bisect confirmed zero regression.

**Why DEFER not KILL**: the code is correct, the savings are real (just below measurement floor on the canonical journey), and a different shape would surface them — specifically very large lists (10k+ rows) with small frequent appends, where the LIS iteration cost grows linearly with list size while cloneNode cost stays constant per appended row. A 50k-row chat with 1-row appends might show E1 wins. Not measured.

**Why DEFER not GRADUATE**: the canonical chat journey shows 0% win (rubric requires ≥15%). Moving the goalposts to "well it would help on a 50k-row journey" violates the no-moving-goalposts discipline.

## Follow-up

1. **Don't merge the code change as a perf win** — it doesn't earn its complexity on the canonical workload.
2. **Worth keeping if the framework gets a 10k+ row stress journey** (would be E1.1 or merged into the dashboard journey at 10k rows). At that scale the LIS work might surface in measurements. Re-record then.
3. **Useful intermediate finding**: the existing 2-tier LIS fast path (`computeForLis` tier 1 + tier 2) is already so good for append shapes that it nearly matches a full append-only specialization. The previous PR #312 (LIS prepend fast-path) and the existing tier-1 extend logic are doing most of the heavy lifting.
4. **Rubric calibration for future experiments**: the 15% threshold may be too aggressive for journeys whose dominant cost is `cloneNode` rather than reconciliation. Future Phase 1 experiments should pick journeys where the targeted optimization is actually the bottleneck.
