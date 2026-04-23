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

| Code | Meaning |
| --- | --- |
| 0 | success |
| 1 | argv / config (unknown app, unknown journey) |
| 2 | server didn't start / didn't respond |
| 3 | browser navigation or journey threw |
| 4 | harness not installed (example forgot `install()` in its entry) |

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
