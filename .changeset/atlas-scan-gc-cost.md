---
'@pyreon/atlas': patch
---

`atlas scan` ~40x faster — the leak check was paying a full GC per scenario

A scan of a variant-heavy design system (108 components, 1090 scenarios) took
41s, and 98.3% of it was one plugin hook. Two hypotheses about which part died
to measurement first — the static scan is 35ms, and the settle loop exits
immediately rather than burning its runway — so the attribution now comes off a
profiling seam (`ATLAS_PROFILE=1`) rather than from reading the code. What it
found: 2767 `Bun.gc(true)` calls at ~20ms each.

A forced collection is now charged for a GROUP OF COMPONENTS, not for each
scenario. One sweep answers the question for all of them, because a reactive
graph that returns to its baseline after every scenario in the group has been
mounted and disposed proves that none of them retained a node. Components are
grouped until a group holds ~256 scenarios: 2767 collections become 8, and the
scan goes from 40.8s to ~2s (medians of interleaved runs on an idle machine).
`atlas build` benefits identically.

The bound costs nothing measurable — grouped and ungrouped medians are within
noise of each other — and buys two things: peak memory that stays knowable at
monorepo scale rather than extrapolated from a smaller one, and a blast radius
of one group when something does leak, instead of the whole catalog.

Nothing is guessed when a catalog is not clean. It is re-probed once — exercise
everything again and require the count to keep CLIMBING, which separates
one-time retention (a module-level store registry, a memoized theme) from a
per-mount leak — then falls back to per-component and finally to per-scenario
resolution, so a real leak is still attributed to the scenario that causes it.

This also removes a pre-existing flaky FALSE POSITIVE. Requiring accumulation
across two full catalog passes is a much stronger filter than across two mounts
of one scenario, so a one-node engine straggler no longer reads as a leak:
`stack--indent-large-gap-xxlarge-gapy-medium` failed 1 run in 5 before and is
stable across 6 runs now.

`VerifyContext` gains an optional `components` field — every decorated component
in the run — so a plugin whose check has a large FIXED cost can pay it once for
the catalog instead of once per component. `createAtlas` now decorates
everything before verifying anything, which is what makes that set available.

Identical output otherwise: same components, same scenarios, same interaction
verdicts, same a11y verdicts, byte-identical agent guide. Bisect-verified at
every decision point that gates leak detection — each one, disabled, makes the
real end-to-end leak test fail.

Alternatives measured and NOT taken, recorded in the source so they are not
re-tried: a nursery GC (`Bun.gc(false)`) is 10x worse, because it does not run
the FinalizationRegistry callbacks the registry drops nodes through; loading
discovery's modules concurrently is slower, because Vite's `ssrLoadModule`
serializes on the shared module graph; and extra yields after a sweep do not
replace the second sweep.

Adds `ATLAS_PROFILE=1`, which reports scan cost per plugin hook.
