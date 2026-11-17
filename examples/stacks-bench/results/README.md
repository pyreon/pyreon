# Results

**No result of this benchmark is published or committed.** This directory holds only this file. The harness writes each run into `results/<runId>/`, which git ignores.

The only runs so far were taken on a shared machine under load, to check that the harness works. Their numbers are not a result and are quoted nowhere in this repository.

## What a run writes

`bun bench-stacks.ts` creates one directory per run, named after its UTC start time (for example `2026-11-17T10-55-50Z`):

| File         | Content                                                                                   | Type                                               |
| ------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `run.json`   | The run manifest: machine, tool versions, harness commit, settings, the order of the arms | `RunManifest` in [`lib/run.ts`](../lib/run.ts)     |
| `<arm>.json` | Every raw sample of one arm, one file per arm                                             | `ArmResult` in [`lib/result.ts`](../lib/result.ts) |

`bun bench-stacks.ts --report [runId]` prints the tables from those files and checks the conditions below. Both files carry `"schema": 1`; the harness refuses a manifest with another schema number.

### `run.json`

| Field                             | Meaning                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `schema`                          | `1`                                                                                                             |
| `runId`                           | The directory name                                                                                              |
| `startedAt`, `finishedAt`         | ISO timestamps: when the run was opened and when its last arm ended                                             |
| `harness.commit`, `harness.dirty` | The commit of this repository the harness and arms were read from, and whether the tree had uncommitted changes |
| `machine`                         | `cpuModel`, `logicalCores`, `totalMemGb`, `platform`, `release`, `arch`                                         |
| `tools`                           | Versions of `bun` (runs the harness), `node` (runs every server), `chromium`, `autocannon`, `playwright`        |
| `knobs`                           | `starts`, `browserStarts`, `loads`, `durationS`, `warmupS`, `connections`, `ttfbRequests`                       |
| `waitQuiet`                       | The load ceiling `--wait-quiet` waited for before every arm, or `null`                                          |
| `zeroSource`                      | `npm` or `workspace`: where the zero arm's `@pyreon/*` packages came from                                       |
| `order`                           | Arm ids in the order they were measured                                                                         |

### `<arm>.json`

| Field                                     | Meaning                                                                                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`, `runId`, `id`, `label`          | Identity                                                                                                                                                                           |
| `versions`                                | Installed version of every package the arm's `stack.json` lists                                                                                                                    |
| `node`, `chromium`                        | Runtime versions                                                                                                                                                                   |
| `hydration`, `streaming`, `notes`, `docs` | Copied from the arm's `stack.json`                                                                                                                                                 |
| `gateNotes`                               | Notes from the correctness gate                                                                                                                                                    |
| `load.before`, `load.after`               | `os.loadavg()` (1, 5 and 15 minutes) before and after the arm                                                                                                                      |
| `startedAt`, `wallMs`                     | When the arm started and how long it took                                                                                                                                          |
| `server[]`                                | One entry per server start: `coldStartMs`, `rps`, `p50`, `p99`, `errors`, `non2xx`, `bytesPerReq`, the per-request arrays `ttfb` and `ttlb`, `contentEncoding`, `transferEncoding` |
| `browser[][]`                             | Per browser server start, one entry per timed page load: `windowMs`, `scriptMs`, `layoutMs`, `busyMs`, `clickMs`, `docResponseEndMs`                                               |
| `inventory`                               | `html` (`raw`, `gzip`, `brotli`, `inlineScriptBytes`), `scripts[]` (`url`, `how`, `executed`, `raw`, `gzip`, `brotli`), `totals`, `requests`                                       |

Times are milliseconds and sizes are bytes. [`../README.md`](../README.md) defines each measurement.

## What a publishable run must meet

These come from the repository's measurement protocol (`.agents/guides/benchmarks/README.md`). `--report` checks the ones a single run can show and prints `NOT PUBLISHABLE` with the reason when one fails.

1. **A quiet machine.** Nothing else is running. The 1-minute load average is at or under 4 before and after every arm. Run with `--wait-quiet 4` so the harness waits for that before each arm; the stamps are in every arm file.
2. **Every arm in one run.** All nine arms, one invocation, one machine, one session. Arms from different runs are never mixed in one table.
3. **The harness defaults, or more samples.** No setting is lowered through the `STACKS_*` variables.
4. **A committed tree.** The run names a commit of this repository with no uncommitted changes, so the measured code can be checked out.
5. **The zero arm from npm** (`bun setup.ts`, the default). A `--zero=workspace` run measures unreleased code and is a development measurement.
6. **No errors under load.** No connection error, timeout or non-2xx response in any arm.
7. **Two runs.** At least two complete runs that each meet 1 to 6. A row is a win or a loss only when the confidence intervals are disjoint in every run. Overlapping intervals are a tie, and a row where the runs disagree is reported with both.
8. **Hardware and versions stated.** The published text names the machine, operating system, Node, bun and Chromium versions and the version of every framework, all taken from the run files.

Losses are published with the wins, and first.

## Where a published run goes

Publishing is a separate decision. When it is made, the run directories are copied unchanged to `results/published/<runId>/` and committed in the pull request that publishes the numbers. Every figure in the text can then be recomputed from the raw samples: `bun bench-stacks.ts --report published/<runId>`.
