---
'@pyreon/atlas': patch
---

`atlas scan` 4-13x faster — the leak check was paying a full GC per scenario

A scan of a variant-heavy design system (108 components, 1090 scenarios) took
42s, and 98.3% of it was one plugin hook. Two hypotheses about which part died
to measurement first — the static scan is 35ms, and the settle loop exits
immediately rather than burning its runway — so the attribution now comes off a
profiling seam (`ATLAS_PROFILE=1`) rather than from reading the code. What it
found: 2767 `Bun.gc(true)` calls at ~20ms each.

The leak check is now charged per COMPONENT rather than per scenario. One sweep
answers the question for every scenario a component owns, because a graph that
returns to its baseline after all of them have been mounted and disposed proves
none of them retained anything. A dirty batch is re-run once — which tells
one-time retention (a module-level store registry, a memoized theme) from a
per-mount leak — and only something genuinely climbing is separated scenario by
scenario. The warm-up mount no longer needs its own settle, the resting graph
carries across components, and each GC call sweeps once rather than twice
(the settle loop already retries, and stops as soon as the count is at the
floor).

One sweep now answers for the WHOLE catalog, not just one component: 2767
collections become 3, and a 108-component / 1090-scenario scan goes from 40.8s
to 1.0s (medians of interleaved runs on an idle machine). A catalog that does
retain something falls back to per-component and then per-scenario resolution,
so a real leak is still attributed to the scenario causing it.

This also removes a pre-existing flaky FALSE POSITIVE. Requiring accumulation
across two full catalog passes is a much stronger filter than across two mounts
of one scenario, so a one-node engine straggler no longer reads as a leak:
`stack--indent-large-gap-xxlarge-gapy-medium` failed 1 run in 5 before and is
stable across 6 runs now.

Identical output throughout: same components, same scenarios, same interaction
verdicts, same leak verdicts, byte-identical agent guide. Bisect-verified — the
real end-to-end leak test still fails when the detection is disabled.

Two alternatives were measured and are NOT taken, recorded in the source so they
are not re-tried: a nursery GC (`Bun.gc(false)`) is 10x worse, because it does
not run the FinalizationRegistry callbacks the registry drops nodes through; and
loading discovery's modules concurrently is slower, because Vite's
`ssrLoadModule` serializes on the shared module graph.

Adds `ATLAS_PROFILE=1`, which reports scan cost per plugin hook.
