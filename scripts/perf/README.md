# scripts/perf

Playwright-driven perf journey recorder + regression diff. Glue between the in-browser `@pyreon/perf-harness` counters and the CI workflow at `.github/workflows/perf.yml`.

## `record.ts`

```bash
bun run perf:record --app <name> --journey <name> [--runs 5] [--mode dev|preview]
```

What it does:

1. Starts the example's Vite server (`dev` by default, or `preview` for a prod build)
2. Launches headless Chromium
3. Waits for `__pyreon_perf__` to appear on `window` (the example must call `install()` in its entry)
4. Runs the named journey N times, resetting counters before each run
5. Takes the median of each counter, median wall-clock ms, median heap bytes
6. Writes `perf-results/<git-sha>-<app>-<journey>.json`

Journey catalog: each example exports a `journeys` object from `src/journeys.ts` keyed by journey name, value is an async function taking a Playwright `page`. See `examples/perf-dashboard/src/journeys.ts` for the reference.

Exit codes (so CI can classify failures):

| Code | Meaning                                                         |
| ---- | --------------------------------------------------------------- |
| 0    | success                                                         |
| 1    | argv / config (unknown app, unknown journey)                    |
| 2    | server didn't start / didn't respond                            |
| 3    | browser navigation or journey threw                             |
| 4    | harness not installed (example forgot `install()` in its entry) |

**Preview mode warning**: prod builds tree-shake the counter emit call tree, so counters stay at zero even though `install()` still runs. Use `--mode dev` for meaningful numbers. `--mode preview` is useful for bundle-size and boot-time comparisons, not counter measurement.

## `diff.ts`

```bash
bun run perf:diff <baseline.json> <current.json> [--threshold 0.10] [--output summary.md]
```

Compares two record files. Exits `0` on no regression, `1` otherwise. Only upward counter movement counts (less work = always fine). Uses an absolute floor of `max(3, before × threshold)` so rare counters going `2 → 3` don't trip the gate on what would otherwise be a 50% swing.

`--output` writes a markdown summary with a sticky marker suitable for posting as a PR comment.

## Typical workflow

```bash
# Local: record against main, apply a change, re-record, diff.
git checkout main && bun run perf:record --app perf-dashboard --journey shuffleRows
mv perf-results/*-perf-dashboard-shuffleRows.json perf-results/before.json
git checkout my-branch
bun run perf:record --app perf-dashboard --journey shuffleRows
bun run perf:diff perf-results/before.json perf-results/*-perf-dashboard-shuffleRows.json
```

## CI

`.github/workflows/perf.yml` runs on:

- `workflow_dispatch` — manual any-branch record
- `pull_request` — only when labelled `perf`; diffs against committed baseline
- `schedule` — nightly drift check (artefact only, no auto-commit)

Baselines are committed manually to `perf-results/baseline-<app>-<journey>.json` after reviewing a nightly artefact. The workflow does NOT auto-commit baselines — intentional, since they're load-bearing.

## `../leak-audit.ts` — heap-growth leak detector

A separate script in `scripts/leak-audit.ts` (not under `perf/` because it answers a different question — "is the heap growing over time?" rather than "what's the per-counter cost of one journey?").

```bash
bun run scripts/leak-audit.ts --app perf-dashboard --journey toggleTheme --cycles 50 [--threshold 50000] [--json out.json]
```

What it does:

1. Builds + serves the example (production-mode `preview` by default — measures real-shape behavior, not dev with sourcemaps inlined)
2. Launches Chromium with `--js-flags=--expose-gc` so the script can call `globalThis.gc()` between samples (removes the dominant source of `usedJSHeapSize` noise: async V8 collection cycles running mid-sample)
3. Boots + warms up (5 cycles, discarded)
4. Runs `cycles` iterations:
   - Runs the journey
   - Force GCs twice (first call frees, second compacts)
   - Samples `performance.memory.usedJSHeapSize`
5. Least-squares linear regression on (cycle, heap-size). Reports slope (bytes/cycle), intercept, R² (fit quality), CV (jitter)
6. Asserts slope is below `--threshold` (default 50_000 bytes/cycle)

Exit codes:

| Code | Meaning                                                   |
| ---- | --------------------------------------------------------- |
| 0    | no leak — slope within threshold                          |
| 1    | argv / config problem                                     |
| 2    | server didn't start                                       |
| 3    | browser navigation or journey threw                       |
| 4    | `performance.memory` unavailable (need Chrome / Chromium) |
| 5    | `globalThis.gc` unavailable (`--expose-gc` not honored)   |
| 6    | LEAK DETECTED — slope exceeds threshold                   |

**Intentionally NOT a required CI gate.** Heap-growth is environmentally noisy (background GC, JIT warmup, allocator fragmentation) — false positives would erode the gate's credibility. Use cases:

- Local diagnostics when you suspect a leak ("does heap stay flat across N route navigations?")
- Nightly job against a known-clean baseline
- Pre/post comparison around a specific PR ("did this change introduce per-cycle heap growth?")

Companion to the unit-test regression locks in `@pyreon/core/src/tests/context.test.ts` (the structural bug-shape that motivated #768). Those tests catch the deterministic fingerprint of the context-snapshot leak class; this harness catches heap-growth patterns the unit tests can't see (event listener accumulation, observer leaks, signal-subscriber leaks, etc.).

The pure `linearRegression()` math export is unit-tested at `packages/internals/test-utils/src/tests/leak-audit.test.ts` — including a "bug-replication shape" spec that proves the harness CAN detect the original 5 MB/cycle context-snapshot leak class (so the smoke-test "no leak" result on a clean codebase is falsifiable evidence, not just absence of evidence).

## `../leak-sweep.ts` — multi-journey audit driver

Runs `leak-audit`'s methodology across every journey in an example, sharing one server + browser session for the whole sweep (10-15× faster than invoking `leak-audit.ts` N times with per-invocation overhead).

```bash
bun run perf:leak-sweep --app perf-dashboard [--cycles 15] [--warmup 3] [--threshold 50000] [--journeys j1,j2] [--json out.json]
```

Output: markdown table sorted by slope descending (worst first), plus JSON archive. Each journey gets the same statistical treatment (linear-regression slope, R², CV — same machinery as `leak-audit.ts`). Exit codes match `leak-audit.ts`: 0 = all clean, 6 = at least one journey exceeded threshold.

Baseline captured at `perf-results/baseline-leak-sweep-perf-dashboard.json` — full 43-journey result against the dedup-merged state (post-#768). **All 43 journeys had slope = 0 KB/cycle** (heap rock-solid at 9.54 MB across 15 cycles each). This is the "everything is clean" reference point for future diff runs.

**Important caveat**: Chrome's `performance.memory.usedJSHeapSize` is bucketed to ~100 KB increments for privacy. With ~10 MB baseline heaps, this means changes below ~100 KB/cycle aren't detectable by this harness. The 9.54 MB readings are honest "no detectable growth" but not "provably zero allocation"; deeper analysis would need CDP `HeapProfiler.takeHeapSnapshot` + retained-class-size analysis. Filed as future work.

**Real bug surfaced by the sweep** (filed as separate work, not addressed in this PR): the `domConditionalToggle-1000` journey (1000 `<Show>` items inside a `<For>` with `toggleDrive(2)` mass-toggling all signals) triggers an `Unhandled effect error: NotFoundError: Failed to execute 'insertBefore'…` in `mountReactive`. Heap stays bounded (the framework catches the error), but the symptom indicates a real DOM-reconciliation race under deeply-batched signal writes. The sweep is the first tool to surface this — none of the existing browser-test suites assert on `console.error` output during reactive batches. Separate PR will land a defensive guard + a regression-locking browser test.
