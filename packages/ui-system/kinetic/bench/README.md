# @pyreon/kinetic — animation JS-overhead benchmark

Real-Chromium (Playwright) benchmark of the **synchronous framework JS overhead**
each library pays to **reveal N elements with an equivalent enter / stagger
animation**.

```bash
cd packages/ui-system/kinetic && bun run bench
```

## What this measures — and what it does NOT

kinetic is **CSS-transition-based**: it applies enter/leave classes/styles and
lets the browser **compositor** run the tween. Motion One's `animate` on
compositable properties uses **WAAPI** — also compositor-driven. So the actual
animation runs off the main thread and is **identical in smoothness across all
three** contenders; smoothness is a browser property, not a framework axis.

The only framework-attributable cost is therefore the **synchronous JS to set
up + commit the reveal**, which is what this bench times. It does **not** measure
animation smoothness, frame rate, or interpolation quality.

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

- Element **creation is un-timed** (a constant setup phase); only the reveal
  trigger is timed. So kinetic's number is its enter-commit orchestration (N
  state-machine ticks + class/style writes), Motion One's is its `animate()`
  setup, baseline's is a class toggle.
- Every contender animates the **same visual**: opacity 0→1 + translateY 16→0
  over 300ms ease-out.
- The timed block flushes **one microtask** (kinetic's enter effect commit
  boundary) — a turn the synchronous WAAPI/baseline paths pay too, so nobody
  gets a free async deferral.
- **Correctness gate** per sample: the reveal must produce N elements in a real
  reveal state or the sample is rejected.
- `NODE_ENV=production` forced before any framework import; real published
  `motion`; **real Chromium**; per-sample fresh container + teardown;
  randomized run order per (op, N); median + 95% bootstrap CI + CI-overlap tie
  marker.

## Representative result — R1 (measured, Apple M3 Max, Chromium)

Median ms (lower = faster). `[CI95]`. Numbers move run-to-run (Motion One's
WAAPI object allocation shows notable variance); reproduce with `bun run bench`.

| Scenario | baseline (floor) | kinetic | motion (Motion One) | kinetic vs Motion One |
| --- | --- | --- | --- | --- |
| enter 500  | 0.2 ms | **1.2 ms** `[1.2, 1.3]` | 1.9 ms `[1.7, 2.0]` | **kinetic 1.6× faster** |
| enter 2000 | 0.7 ms | 5.1 ms `[4.9, 5.3]` | 8.0 ms `[5.2, 8.5]` | 🤝 tie (Motion One CI wide) |
| stagger 300  | 0.1 ms | 0.8 ms `[0.8, 0.8]` | 0.9 ms `[0.8, 0.9]` | 🤝 tie |
| stagger 1000 | 0.4 ms | 2.8 ms `[2.7, 2.9]` | 2.4 ms `[2.3, 3.1]` | 🤝 tie |

## Honest verdict (author-judge disclosed)

- **kinetic is competitive with Motion One on framework JS overhead** — it wins
  the small-enter case outright and ties the other three (Motion One's WAAPI
  path shows higher variance, so the large-N cases are statistical ties).
- **Both are ~6–8× the bare-CSS floor.** That constant is the cost of a real
  animation abstraction (a lifecycle state machine + completion callbacks +
  reduced-motion + reactive props for kinetic; WAAPI Animation objects for
  Motion One) over a raw class toggle. The floor buys none of that.
- **kinetic's per-child mount is a real cost at large stagger N.** kinetic
  mounts a full per-child component (its own state machine + `transitionend`
  wiring, which is what enables per-child reduced-motion + per-child callbacks);
  Motion One's stagger is one `animate(elements, …)` call. This is why kinetic's
  large-N stagger tracks slightly behind Motion One.

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
