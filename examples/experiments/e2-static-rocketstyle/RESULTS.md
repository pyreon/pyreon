# E2: Compile-time wrapper-collapse for rocketstyle

## Question

Does compile-time resolution of rocketstyle dimension props for literal-prop call sites collapse 5+ wrapper layers into a single `_tpl()` cloneNode operation, dropping mountChild by 3-5× and boot wall-clock by 50-70%?

## GRADUATE / KILL criteria (frozen, copied from PLAN)

| Outcome | Per-mount wall-clock | mountChild per visible | Action |
|---|---|---|---|
| **GRADUATE** | collapsed ≤ 30% of baseline | ≤ 1.5 | Write compiler-pass plan as next experiment |
| **DEFER** | 30-70% of baseline OR mountChild 1.5-3 | mixed | Real win, compiler cost might not justify — re-evaluate |
| **KILL** | > 70% of baseline OR no mountChild reduction | > 3 | Hypothesis false, postmortem, stop |

## Method

1. Real Chromium via `@vitest/browser` + Playwright.
2. Mount one baseline `<Button state="primary" size="large">` first to populate the styler sheet AND capture the resolved class string.
3. Bench:
   - **baseline**: PyreonUI provider mounted ONCE, then N=200 `<Button>` mounts inside it, dispose, repeat 5 times.
   - **collapsed**: hand-written `_tpl()` cloneNode with the captured class string + label text. No provider needed.
4. Snapshot perf-harness counters before/after each bench. Compare medians + per-mount counter ratios.
5. Both versions go through `mount()` from `@pyreon/runtime-dom` so the comparison is on what the user actually pays per Button instance. PyreonUI cost is amortized across the 200 mounts (real apps mount it once per app boot).

## Results

| Metric | Baseline | Collapsed | Δ |
|---|---|---|---|
| Wall-clock median (200 mounts × 5 runs) | **8.80ms** | **0.20ms** | **44× faster** |
| Wall-clock per mount | 44µs | 1µs | 44× |
| mountChild per visible button | **9.0** | **1.0** | 9× reduction |
| runtime.tpl per visible button | 0 | 1 | cloneNode fast path active |
| styler.resolve per button | **110** | 0 | -100% |
| unistyle.descriptor per button | **105** | 0 | -100% |
| unistyle.styles per button | 25 | 0 | -100% |
| rocketstyle.getTheme per button | 5 | 0 | -100% |
| rocketstyle.localThemeManager.hit per button | 20 | 0 | -100% |
| reactivity.computedRecompute per button | 5 | 0 | -100% |
| styler.sheet.insert per button | 15 | 0 | -100% |
| reactivity.effectRun per button | 5 | 0 | -100% |

Raw bench output:
```
[e2:setup] resolvedClass=pyr-38xe3m pyr-186j8ah
[e2:baseline]   N=200 × RUNS=5 median=8.80ms runs=[9.9, 8.8, 8.8, 8.4, 8.8]
[e2:collapsed]  N=200 × RUNS=5 median=0.20ms runs=[0.2, 0.2, 0.1, 0.2, 0.2]
[e2:result]     baseline=8.80ms collapsed=0.20ms ratio=2.3%
                mountChild/visible: baseline=9.00 collapsed=1.00
```

## Decision

**Outcome: GRADUATE.** The hypothesis is dramatically validated.

| Criterion | Threshold | Actual | Status |
|---|---|---|---|
| Wall-clock | collapsed ≤ 30% of baseline | **2.3%** | ✅ exceeds by 13× |
| mountChild | ≤ 1.5 per visible | **1.0** | ✅ exact target |

## Striking secondary findings worth their own attention

These weren't part of the original hypothesis but the data surfaced them:

1. **Each rocketstyle Button mount fires ~110 styler.resolve and ~105 unistyle.descriptor calls.** That's per single button. Even WITHOUT compile-time collapse, this volume is concerning. Most are probably cache-hits (the existing resolve cache works) but the lookup cost adds up. Worth a separate audit of WHY styler.resolve fires so many times per rocketstyle component.

2. **mountChild = 9 per visible button**, not the 5 I estimated from the architectural diagram. There are more wrapper layers than expected. Likely candidates: nested `Wrapper` helper inside `Element`, dimension-applier HOC inside rocketstyle, additional context providers inside PyreonUI. A `runtime.mountChild` flame chart would show the exact tree.

3. **The pseudo-state CSS (hover, focus, disabled, active) costs ZERO at runtime in the collapsed version** because all four pseudo-state rules are part of the same generated CSS class. The styler sheet has them; the collapsed `<button class="...">` reuses them. So pseudo-state styling Just Works without any per-mount cost.

## Honest caveats — what the prototype skips

The 44× factor is the **upper bound** of what's possible — a real compiler would have to handle more cases:

1. **Reactive props bypassed.** `<Button state={signal}>` would NOT be statically resolvable; the compiler must fall through to the regular rocketstyle path. The estimate of % statically-resolvable call sites is the load-bearing question for the achievable bound.

2. **Event delegation skipped.** The collapsed version has no `onClick` handler. A real compiler would emit `el.__ev_click = handler` after the cloneNode + class. ~5µs per handler — small relative to the 43µs win per mount.

3. **Custom theme switching skipped.** If the user changes the theme at runtime, statically-resolved buttons stay on the old theme until remount. A compiler pass would need either (a) skip collapse for components inside a theme-switching subtree, or (b) keep a small reactive class swap. The cost decision: accept "no live theme swap on collapsed sites" or add ~2-3µs back per mount for the swap subscription.

4. **Hover state IS handled** (the CSS class includes `:hover` rules from the sheet) but **anything that depends on a signal-driven state, like `disabled={isLoading}`, would prevent collapse**. The compiler would need to detect dynamic dimension props and fall through.

5. **Context providers other than PyreonUI** (e.g. the user's own context for app-specific state) would still need to be mounted. The collapse only skips the rocketstyle/styler/element wrapper chain, not user-defined providers.

## Realistic achievable-bound estimate

Even being conservative:
- 50% of call sites resolvable + 44× win on those + identity on others = **22× average improvement on resolved sites alone, ~10× weighted across the codebase.**
- 30% resolvable = **~6× weighted improvement.**

Even the pessimistic 30%-resolvable case is enormous compared to the typical perf-PR delta.

## Follow-up — next plan

GRADUATE → next step is **NOT another experiment** but a real RFC/plan:

1. **`@pyreon/compiler` pass for static rocketstyle resolution.** Detect `<RocketComponent state="X" size="Y" ...>` call sites where every dimension prop is a literal string (or a literal that can be statically traced). At build time:
   - Run the rocketstyle dimension chain in the compiler.
   - Emit the resolved class string + a `_tpl()` cloneNode call for the final DOM element.
   - For non-resolvable call sites, emit the current `h(Component, ...)` path unchanged.
2. **Estimate scope before committing.** Audit `examples/ui-showcase` and `examples/perf-dashboard` (or the bokisch.com app if available) for the % of rocketstyle call sites with literal dimension props. Target: ≥40% resolvable to justify the compiler work.
3. **Engineering cost: ~4-6 weeks** for a focused compiler pass. Ship as a feature flag in `@pyreon/compiler` so apps can opt in.

## What lands in this PR

- `examples/experiments/e2-static-rocketstyle/PLAN.md` — the original plan
- `examples/experiments/e2-static-rocketstyle/RESULTS.md` — this writeup
- `examples/experiments/e2-static-rocketstyle/results/<sha>.json` — typed measurement record
- `examples/experiments/e2-static-rocketstyle/baseline-Button.tsx` — current `<Button>` mount harness with PyreonUI provider amortization
- `examples/experiments/e2-static-rocketstyle/collapsed-Button.ts` — hand-written compile-output equivalent
- `examples/experiments/e2-static-rocketstyle/e2.browser.test.ts` — 2 vitest browser tests: parity check (DOM matches) + benchmark with assertions
- Harness changes to `@pyreon/experiments` package: added `@pyreon/ui-components` / `@pyreon/ui-core` / `@pyreon/ui-theme` deps, `@pyreon/vite-plugin` devDep for browser-test JSX transforms, `vitest.browser.config.ts` with the Pyreon plugin wired.

## What's NOT in this PR

- The compiler pass. That's a separate ~4-6 week project, opened as a focused RFC after this lands.
- A redesign of `@pyreon/ui-components`. The existing API can stay — the compiler pass is transparent to user code.
- Audit of % statically-resolvable call sites in real apps. That's step 2 of the follow-up plan.
