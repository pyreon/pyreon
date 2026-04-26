# E2-revisited: Compile-time wrapper collapse for rocketstyle

## Hypothesis

Resolving rocketstyle dimension props at build time for literal-prop call sites can collapse 5+ wrapper layers into a single `_tpl()` cloneNode operation, dropping mountChild by 3-5× on resolvable sites and boot wall-clock by 50-70%.

## Why now (data from boot profile, not opinion)

- E1 (DEFER): mountFor optimization didn't show — picked the wrong layer (cloneNode dominates, not LIS).
- Boot profile of `examples/perf-dashboard`: 2,814 mountChild for ~50-100 visible elements ≈ **30-50× amplification**.
- `runtime.tpl=50/2814 = 1.7%` cloneNode fast-path coverage. Styler / elements / rocketstyle don't use `_tpl()`.
- This experiment targets the layer where cost actually lives.

## Decision rubric (frozen before starting)

| Outcome | Per-mount wall-clock | mountChild per visible | Action |
|---|---|---|---|
| **GRADUATE** | collapsed ≤ 30% of baseline | ≤ 1.5 | Write compiler-pass plan as next experiment |
| **DEFER** | 30-70% of baseline OR mountChild 1.5-3 | mixed | Real win, compiler cost might not justify — re-evaluate |
| **KILL** | > 70% of baseline OR no mountChild reduction | > 3 | Hypothesis false, postmortem, stop |

## Method

1. Real Chromium via `@vitest/browser` + Playwright.
2. Mount one baseline Button to populate the styler sheet AND capture the resolved class string.
3. Bench:
   - **baseline**: PyreonUI provider mounted ONCE (amortized), then N=200 `<Button state="primary" size="large">` mounts inside it, dispose, repeat 5 times.
   - **collapsed**: hand-written `_tpl()` cloneNode with the captured class string + label text. No provider needed.
4. Snapshot perf-harness counters before/after each bench. Compare medians + per-mount counter ratios.

## What I will write
- `baseline-Button.tsx` — current `<Button>` mount harness
- `collapsed-Button.ts` — hand-written compile-output equivalent (single `_tpl`)
- `e2.browser.test.ts` — driver + DOM parity check + benchmark
- `RESULTS.md` — written AS measurement happens

## What I will NOT write
- A compiler pass
- A new rocketstyle API
- New code in `packages/`
- More plan/scaffold docs

## Honest risks
1. Hand-written prototype might over-claim what a real compiler can deliver. Document explicitly in RESULTS.md what's bypassed.
2. Wrapper layers might do load-bearing work the prototype skips (event delegation, theme reactivity). Enumerate.
3. Boot might not be the right journey — mount is the heaviest, but real apps' user-perceived cost lives on re-render. Measure boot first since the data exists.

## Time budget
~7 hours / one focused session. If 7 hours in I don't have a number, abort and report.
