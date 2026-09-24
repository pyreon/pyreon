# @pyreon/kinetic — animation JS-overhead benchmark

Real-Chromium (Playwright) benchmark of the **main-thread framework JS** each
library runs to **reveal N elements with an equivalent enter / stagger
animation**, from the reveal trigger until the end state is reached.

```bash
cd packages/ui-system/kinetic && bun run bench          # full run
cd packages/ui-system/kinetic && bun bench/run.ts --quick   # correctness smoke; timings meaningless
```

## What this measures — and what it does NOT

kinetic is **CSS-transition-based**: it applies enter/leave classes/styles and
lets the browser **compositor** run the tween. Motion One's `animate` on
compositable properties uses **WAAPI** — also compositor-driven. So the actual
animation runs off the main thread and is **identical in smoothness across all
three** contenders; smoothness is a browser property, not a framework axis.

The framework-attributable cost is therefore the **main-thread JS to set up +
commit the reveal** — including work a library defers to animation frames
(kinetic applies its enter-to state in a batched double-`requestAnimationFrame`).
It does **not** measure animation smoothness, frame rate, or interpolation
quality.

## Contenders

| Contender | What it is |
| --- | --- |
| **kinetic** | The idiomatic `kinetic(tag).<config>` component API (transition + stagger modes). |
| **motion** | Motion One — `animate()` / `stagger()` from the real published `motion` package. |
| **baseline** | Hand-rolled bare-CSS transitions (class toggle). The theoretical **floor**. |

`baseline` is the **cost-of-abstraction reference**, not a peer — it runs no
state machine, no completion callbacks, no `prefers-reduced-motion` handling,
and no reactivity. The real head-to-head is **kinetic vs Motion One**.

## Fairness contract

- Element **creation is un-timed** (a constant setup phase, then two un-timed
  settle frames); only the reveal is timed.
- Every contender animates the **same visual**: opacity 0→1 + translateY 16→0
  over 300ms ease-out.
- **One end point for every arm**: the timed window runs from the trigger
  through the **second animation frame** after it. The sample is the sum of the
  JS inside that window — trigger → microtasks drained, plus frame-1 JS, plus
  frame-2 JS — where each frame's JS is bracketed by a sentinel rAF callback
  registered to run FIRST in that frame and one registered to run LAST. Idle
  time between frames and the browser's own style/layout/paint are excluded
  identically for every arm. A sample where a frame slipped in before the
  microtask drain completed is discarded and retried.
- **End-state correctness gate** per sample, the same criterion for every arm:
  all N elements have a **started animation** (`getAnimations()` non-empty — a
  CSS transition for kinetic/baseline, WAAPI for Motion One) and carry the
  arm's target state (kinetic: inline enter-to styles; baseline: the shown
  class). Element COUNT alone is not accepted — the rows exist before the reveal.
- `NODE_ENV=production` forced before any framework import; real published
  `motion`; **real Chromium**; per-sample fresh container + teardown;
  randomized run order per (op, N); median + 95% bootstrap CI + CI-overlap tie
  marker; machine stamp (CPU, Chromium version, load average) printed.

## Results — WITHDRAWN, re-measurement pending

The previously published table (R1: "kinetic 1.6× faster" on enter 500, ties
elsewhere) is **withdrawn**. It was produced by a harness with three defects,
all fixed here and all of which the new end-state gate now catches:

1. **The window closed after one microtask**, so kinetic's double-rAF enter-to
   application (and any frame-deferred Motion One work) was never timed, while
   Motion One's `animate()` setup was.
2. **The kinetic `enter` arm revealed ONE element, not N.** It called
   `mount()` once per row, and `mount()` clears its container — so the DOM held
   a single element (plus N−1 detached trees still subscribed to `show`). Its
   old gate only checked "at least one element".
3. **The bare-CSS baseline never animated.** The `transition` was declared only
   on the hidden class being removed, so no CSS transition ever started.

No replacement numbers are published until a full run on an idle machine.
Until then, make no kinetic-vs-Motion-One performance claim from this bench.

## What kinetic architecturally CANNOT match (not a perf axis)

kinetic offloads the tween to CSS/compositor — it is **not** a JS animation
engine. It cannot do what Motion One / Framer Motion own: **spring physics**,
**interruptible value animation** (retargeting mid-flight), **layout / shared-
element animations** (FLIP), and **gestures / drag**. Those need a JS animation
loop kinetic deliberately does not run. Reach for Motion One / Framer Motion
when you need them; reach for kinetic for declarative, SSR-safe, reactive-prop
enter/leave/collapse/stagger with zero JS animation loop.

## Limits

- **Author-judge**: the framework author wrote + judges this bench.
- CPU-objective (synchronous JS overhead), not real-world async latency.
- The bare-CSS baseline is often near Chromium's ~100µs `performance.now()`
  clamp; N is scaled so kinetic/motion land well above it, and the floor is
  shown as an absolute reference, not a ratio.
- Framer Motion is **not** measured here (it requires a React runtime); its
  capabilities are covered qualitatively above and in the PR completeness
  matrix.
