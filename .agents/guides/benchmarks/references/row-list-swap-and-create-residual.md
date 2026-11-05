# Row list: swap diagnosis and the create-1k residual (2026-11-05)

Measured on an M3 Max, Chromium 156, main + #4115 (`<For>` direct insertion into the live parent), load 1.7–3.4.

## Swap rows

**Instrument.** `examples/benchmark/bench-swapprofile.ts` with `src/impl/profile-swap.tsx` (served behind `?profileSwap=1`) runs Pyreon, Vue 3.6 Vapor (RC) and hand-written Vanilla in ONE page, each in its own `bench-fixture` host, on the board's exact markup and update shape. It:

- asserts each arm's swap exchanges positions 1 and 998 and a second swap restores them;
- logs every mutating DOM call one swap makes;
- times 400 interleaved rounds the way `bench()` does (`gc()` before each sample, forced `getBoundingClientRect()` inside the window, macrotask yield after), split into update (framework JS + the DOM calls) and flush (style + layout), on the crossOriginIsolated 5 µs clock;
- takes one CPU profile per arm, so whole-profile attribution needs no frame names (Vapor's RC runtime is a minified prod build, and its flush runs in a microtask outside any caller frame);
- `SWAP_CHURN=N` first replaces each arm's rows N times, to approximate the board's history before the swap op.

Run: `BENCH_PROFILE=1 bun run build && bun bench-swapprofile.ts [rounds] [profileIters]`.

**Findings.**

- DOM work is identical. Every arm issues exactly `[insertBefore, insertBefore]` per swap. The row DOM matches: Vapor also writes `class=""` on unselected rows, and Pyreon carries one extra comment marker.
- Layout is identical. A `devtools.timeline` trace over 300 swaps per arm, run twice: `Layout` 575–601 µs/op and `UpdateLayoutTree` 33–34 µs/op for every arm, with no ordering between arms that survives the second run.
- Framework JS, wall medians over four runs: Vanilla 15 µs, Pyreon 25–30 µs, Vapor 40–55 µs. Totals:

  | state | Pyreon | Vapor | Vanilla |
  | --- | --- | --- | --- |
  | fresh page, run 1 | 605 [600–615] | 640 [635–645] | 605 [600–610] |
  | fresh page, run 2 | 615 [610–620] | 640 [635–645] | 610 [605–615] |
  | after 50 replace cycles, run 1 | 585 [580–585] | 610 [605–615] | 570 [565–570] |
  | after 50 replace cycles, run 2 | 600 [595–600] | 600 [600–605] | 560 [560–565] |

- Pyreon's on-CPU work above Vanilla is ~3–5 µs per swap: the arm's `[...rows()]` copy 1.3 µs, `trySmallKPermutation` 1.0, `collectNewKeys` 0.9. The rest of the wall difference is the async boundary. **No reachable lever:** the ceiling is under 1% of the op, and the scratch-reuse variant was already measured and refuted.
- Page history moves the flush for every arm in the page. 50 replace cycles on the OTHER arms shifted Vanilla's untouched table by ~40 µs. A per-arm flush difference under ~30 µs between page states is not attributable to a framework.

**Why Vapor appeared to beat Vanilla.** The fair board runs each framework in its own page load. Same build, same machine, `--repeat 3`, per-pass swap medians in µs:

| framework | pass 1 | pass 2 | pass 3 | pooled |
| --- | --- | --- | --- | --- |
| Vanilla | 763 | 847 | 780 | 775 [765–790] |
| Vue 3.6 Vapor (RC) | 778 | 810 | **520** | 755 [725–790], CV 19% |
| Pyreon | 805 | 703 | 835 | 810 [800–815] |

One cheap page load decides the Vapor cell. Interleaved in one page, Vapor is the slowest of the three because its JS is the largest. This is not a harness asymmetry: Vanilla's swap arm does O(1) JS and the same two `insertBefore` calls as everyone else. Read a swap verdict from the interleaved driver, or only from board passes that agree.

## Create 1,000 / replace: the residual after #4115

`bench-createdecomp.ts 60 1000` (production build) prices the remaining JS gap to Vanilla at 0.44 ms (442 ns/row, CI 0.44–0.46 ms):

| rung | adds |
| --- | --- |
| For reconciler + `_tpl` clone | +135 ns/row [120–140] |
| per-row label `_bindText` + disposer | +85 ns/row [80–100] |
| selector subscribe + `class=""` write + cleanup wrapper | +145 ns/row [130–160] |
| per-row `signal()` in the row model (idiomatic, not removed for the bench) | +163–200 ns/row |

The layout delta spans zero (+15 ns/row, CI −10…+70).

In the `bench-createprofile.ts` CDP profile at 1k, the largest single items that are neither contract nor shared native work are each ≤ 30 µs, i.e. ≤ 0.4% of a ~7.4 ms op:

- `insertBefore` into a connected parent vs Vanilla appending into a detached `<tbody>` and attaching once: ~19 µs;
- `applyClassProp`'s `getAttribute` on a freshly cloned row: ~5 µs;
- the `renderInto` / `buildTpl` wrappers: ~40 µs together.

Considered and not built:

- Baking `class=""` into the row template to skip the `setAttribute` on unselected rows (~20–30 µs). It changes the static skeleton that the hydration-adoption verifier compares against SSR rows, so an SSR row with `class="selected"` would no longer match.
- Detaching the owned `<tbody>` during a fresh render (~19 µs ceiling). It disturbs focus, observers and transitions on a live parent for a sub-noise gain.

Nothing clears the guide's 0.5% create-op noise floor. Re-measure with the ladder before proposing another create lever.

## Vanilla row-building handicap

Already fixed by #3642: `buildRows` delegates to the same `buildRowsWith` helper every arm uses, so the board has no `Array.from` asymmetry. `bench-createdecomp.ts` still labelled the board's vanilla build "Array.from … FAVOURS Pyreon"; it is relabelled. The −50 to −70 ns/row it still reports between `buildRows` and an inline-factory `buildRowsWith` comes from factory shape and call-site polymorphism in that shared page. The board runs each arm in its own page, so the difference does not exist there.
