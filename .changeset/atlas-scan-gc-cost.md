---
'@pyreon/atlas': patch
---

`atlas scan` ~10x faster — the leak check was paying a full GC per scenario

A scan of `@pyreon/ui-components` (108 components, 1090 scenarios) took 56s, and
98% of it was one plugin hook. Profiling it — after two hypotheses that
measurement disproved — showed the cost was `Bun.gc(true)`: ~2767 full
collections, ~20ms each.

Three changes, each measured end-to-end and each leaving every verdict identical:

- **The resting graph carries across scenarios.** The baseline settle re-derived
  per scenario a value the previous scenario's settle had already established.
  It now runs once per component. (26.6s of the 56s.)
- **One GC answers a batch of scenarios.** If the graph returns to its baseline
  after 32 scenarios have been mounted and disposed, none of them retained
  anything; only a dirty batch needs the scenarios separated, and that path is
  rare. Batch size 32 is the measured knee of the curve.
- **One sweep per GC call, not two.** The settle loop already retries, and it
  stops as soon as the count is at the floor — so the unconditional second sweep
  was paid even when the first had settled the graph. A nursery collection was
  measured as an alternative and is 10x *worse*: it does not run the
  FinalizationRegistry callbacks the registry drops nodes through, so the loop
  never reaches its floor.

Verified identical: same components, same scenarios, same per-scenario verdicts,
byte-identical agent guide. The real end-to-end leak proof (`scan-leak.test.ts`,
real GC against a leaky fixture) still catches its leak.

Also adds `ATLAS_PROFILE=1`, which reports scan cost per plugin hook — the
attribution that found this after guessing failed twice.
