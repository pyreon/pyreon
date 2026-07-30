---
'@pyreon/native-compiler': patch
---

Content-address the native compile-validation harness so `swiftc` / `kotlinc`
verdicts are not re-derived on every run.

The `Native Compiler Validation` job measured 35-40 minutes and had become the
last check on every PR. The cause was not the number of tests but the number of
**process spawns**: the suite makes ~600 compiler invocations across 123 test
files, and vitest isolates modules per file, so every per-process memo fired
once per file. Measured on an M3 Max (CI runners are 2-3x slower):

| Operation | Cost | Calls | Total |
| --- | --- | --- | --- |
| `kotlinc` compiling a 1-line file | 2.07s | 282 | 9.7 min |
| `kotlinc -version` (availability probe) | 1.36s | 123 | 2.8 min |
| `swiftc -typecheck` SwiftUI + Observation probes | ~1s each | 246 | ~4 min |

The two recorded responses to this pain were a 180s per-spec `testTimeout` and a
50-minute workflow timeout. Both raise the ceiling; neither removes the cost.

Measured effect (same machine, same worktree, identical pass counts throughout).
The A/B holds vite's transform cache warm in BOTH arms so the only variable is
the verdict cache — an unqualified "second run was faster" would otherwise be
measuring vite:

| Suite | Uncached | Empty cache | Warm |
| --- | --- | --- | --- |
| 14-file subset (381 tests) | 117s | 113s | **1s** |
| Full suite (223 files, 2655 tests) | 397s | 306s | **6s** |

Two honest caveats on those numbers:

- The **empty-cache** column is faster than uncached only because the
  tool-availability probes are cached intra-run (the first test file probes
  `kotlinc`, the other 122 read the result). That is worth 91s on the full suite
  — real, and it lands on the very first CI run with no cross-run persistence —
  but it is 91s, not the minutes a serial `123 x 1.36s` estimate suggests: vitest
  runs files in parallel, so probe cost is amortized across workers.
- These are local wall-clock figures. The CI job also installs two toolchains and
  runs scaffold + iOS simulator smokes, none of which this change touches, so the
  job total will not fall in the same proportion as the test step. No job-level
  number is claimed here because none has been measured.

A validate call is a pure function of (validator kind, compiler identity, the
exact stub text, the exact source text, the compiler argv), so its verdict is
content-addressable. Verdicts and tool-availability probes are now cached on
disk, which is the tier that matters — per-file module isolation means an
in-process `Map` is never shared between test files, while disk is shared across
workers *and* across runs.

Correctness properties, each pinned by a test:

- The key folds in the **stub text**. This is load-bearing rather than tidy: the
  stubs are edited regularly, and a superset stub MASKS real breakage. A key
  that omitted them would serve a stale `ok` after a stub edit, silently
  defeating the gate this harness exists to be.
- The key folds in the **compiler version**, so a toolchain upgrade invalidates.
- The key folds in the **validator kind**, because `-parse` accepts sources that
  `-typecheck` rejects.
- `skipped` verdicts are never cached — they encode tool availability, not a
  compiler judgement, so caching one would make an installed toolchain look
  absent.
- A corrupt or wrong-shape cache entry reads as a miss, never as a verdict.
  Entries are written via write-then-rename, so a killed writer cannot leave a
  truncated file that happens to parse.
- "Tool absent" is never cached against a stable key, so installing a toolchain
  takes effect immediately.
- `PYREON_VALIDATE_NO_CACHE=1` bypasses both tiers;
  `PYREON_VALIDATE_CACHE_DIR` relocates the store.

CI wiring: the `Native Compiler Validation` job restores/saves the store with an
accumulating `actions/cache` key (unique per run, `restore-keys` prefix), so a PR
inherits `main`'s warm cache. The **nightly drift run deliberately runs
uncached** — a gate that can only read a cache is one you have to trust blindly,
and that schedule exists to catch a fresh compiler release changing strictness,
which a cache hit would mask.

No emit, warning, or verdict changes — this only stops re-deriving verdicts that
are already determined.
