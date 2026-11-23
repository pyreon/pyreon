# Results

**No result of the catalogue-app benchmark is published or committed.** This directory holds only this file. `bench.ts` writes each run into `results/<runId>/`, which git ignores.

The only run so far was a one-load smoke run on a shared, loaded machine, taken to check that the harness executes and writes this schema. It was deleted; its numbers are quoted nowhere.

## What a run writes

`bun bench.ts` creates one directory per run, named after its UTC start time (for example `2026-11-23T10-55-50Z`; `REAL_BENCH_RUN_ID` overrides it):

| File         | Content                                                                                          | Type                                                       |
| ------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `run.json`   | The run manifest: machine, tools, harness commit, knobs, throttle, timer, load stamps, arm order | `RunManifest` in [`harness/run.ts`](../harness/run.ts)     |
| `<arm>.json` | Every raw sample of one arm                                                                      | `ArmResult` in [`harness/result.ts`](../harness/result.ts) |

`bun bench.ts --report [runId]` re-prints the tables from those files and checks the conditions below. Both files carry `"schema": 1`; the harness refuses a manifest with another schema number.

### `run.json`

| Field                             | Meaning                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `schema`, `runId`                 | `1`; the directory name                                                                                         |
| `startedAt`, `finishedAt`         | ISO timestamps                                                                                                  |
| `harness.commit`, `harness.dirty` | The commit of this repository the harness and arms were read from, and whether the tree had uncommitted changes |
| `machine`                         | `cpuModel`, `logicalCores`, `totalMemGb`, `platform`, `release`, `arch`                                         |
| `tools`                           | Versions of `bun` (runs the harness), `chromium`, `playwright`                                                  |
| `knobs`                           | `loads` (throttled first loads per arm), `memoryLoads` (memory pages per arm), `sessions` (per memory page)     |
| `throttle`                        | `name`, `cpuRate`, `latencyMs`, `downloadKbps`, `uploadKbps`                                                    |
| `timer`                           | `crossOriginIsolated` and the measured `performance.now()` `quantumMs`                                          |
| `waitQuiet`                       | The load ceiling `--wait-quiet` waited for, or `null`                                                           |
| `pyreonSource`                    | `npm` or `workspace`: where the pyreon arm's `@pyreon/*` came from                                              |
| `order`                           | Arm ids in base order; round `r` starts at index `r mod n`                                                      |
| `loadStamps[]`                    | `label`, `at`, `load1`, `load5`, `load15`: before every round of each phase and at the end of each phase        |

### `<arm>.json`

| Field                                               | Meaning                                                                                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`, `runId`, `id`, `label`                    | Identity                                                                                                                                                                      |
| `router`, `state`, `codeSplitting`, `notes`, `docs` | Copied from the arm's `arm.json`                                                                                                                                              |
| `versions`                                          | Installed version of every package `arm.json` lists                                                                                                                           |
| `bundle.firstLoad[]`                                | Every same-origin request of an unthrottled first load of `/products`: `path`, `kind` (`html`, `js`, `css`, `other`), `raw`, `gzip`, `brotli`                                 |
| `bundle.firstLoadTotals`                            | `js`, `css`, `html`: each `raw`, `gzip`, `brotli`, summed over `firstLoad`                                                                                                    |
| `bundle.build`                                      | `js`, `css`: every such file in the build output (loaded or not), `raw`, `gzip`, `brotli`, `files`                                                                            |
| `tti[]`                                             | One per throttled first load: `ttiMs`, `firstRenderMs`, `firstAttemptMs`, `attempts`, `fcpMs`, `domContentLoadedMs`, `loadEventEndMs`, `longTasks`, `transferBytes`           |
| `memory[]`                                          | One per memory page: `blank`, `afterLoad`, `afterSession`, `afterSessions` (each `usedBytes`, `totalBytes`, `nodes`, `listeners`, `documents`, `gcRounds`) and `sessionSteps` |

Times are milliseconds from navigation start, sizes are bytes. [`../../README.md`](../../README.md) ("App metrics") defines each measurement.

## What a publishable run must meet

These come from the repository's measurement protocol (`.agents/guides/benchmarks/README.md`). `bench.ts` refuses outright to measure on a page that is not cross-origin isolated or whose timer is coarser than 20 µs, and refuses an arm that fails the correctness gate. `--report` checks the rest and prints `NOT PUBLISHABLE` with the reason when one fails.

1. **A quiet machine.** Nothing else is running. The 1-minute load average is at or under 4 at every stamp. Run with `--wait-quiet 4`.
2. **Every arm in one run.** All arms in `arms/`, one invocation, one machine. Arms from different runs are never mixed in one table.
3. **The harness defaults, or more samples** (`loads` 15, `memoryLoads` 3, `sessions` 5).
4. **The default throttle** (`mobile`: CPU 4×, 150 ms round trip, 1.6 Mbit/s down, 0.75 Mbit/s up).
5. **A cross-origin isolated timer** with a quantum at or under 20 µs.
6. **A committed tree** with no uncommitted changes, so the measured code can be checked out.
7. **The pyreon arm from npm** (`bun setup.ts`, the default). A `--pyreon=workspace` run measures unreleased code and is a development measurement. The pinned 0.53.0 does not pass the gate yet (see `../../README.md`), so no run can meet this condition until the pin moves to a release that does.
8. **No retried probe.** Every time-to-interactive load's first input was handled.
9. **Two runs.** At least two complete runs that each meet 1 to 8. A cell is a win or a loss only when the confidence intervals are disjoint in every run; overlapping intervals are a tie; a cell where the runs disagree is reported with both.
10. **Hardware and versions stated.** The published text names the machine, operating system, bun and Chromium versions and the version of every framework package, all taken from the run files.

Losses are published with the wins, and first.

## Where a published run goes

Publishing is a separate decision for the maintainer. When it is made, the run directories are copied unchanged to `results/published/<runId>/` and committed in the pull request that publishes the numbers, so every figure can be recomputed: `bun bench.ts --report published/<runId>`.
