# Form benchmark — methodology, fairness & honesty contract

This is the **objectivity contract** for `@pyreon/example-form-bench`. It is committed
and reviewable on purpose: a benchmark is only as trustworthy as the rules it
binds itself to *before* the numbers exist.

The whole design is a deliberate port of the discipline already applied to the
DOM row-list benchmark (`examples/benchmark`, the 2026-06 "objectivity pass" —
see the root `CLAUDE.md` → "Benchmark Results"). Forms are a different domain,
but the failure modes are the same: scheduler latency folded into the timed
region, no per-run reset, no DOM verification, a single cherry-picked
competitor, author-as-judge.

## Two tiers — never conflate them

| Tier | What it measures | What it can claim |
| --- | --- | --- |
| **A — store primitive** (`packages/fundamentals/form/bench/form-bench.ts`) | The headless store WRITE/READ primitive in isolation: `setFieldValue` / `values()` / `reset` with **no DOM, no field subscribers, no render**. Closest *architectural* peer = TanStack Form's `form-core`. | Primitive characterization only. **Never** "fastest form library" — it isn't the user-perceived cost of typing. |
| **B — real app** (this package) | The user-perceived operation in a **real browser**: keystroke → validate → commit to DOM, mount, reset. Each framework in its **idiomatic** model. | A scoped, honest cross-framework comparison — for the **scenarios measured**, with bundle size + retained heap reported alongside. |

A Tier-A multiplier (e.g. "84× on `update-field`") is a *primitive* fact. It
does **not** transfer to "Pyreon forms are 84× faster" — that conflation is
exactly the artifact the DOM bench's objectivity pass existed to kill.

## The fairness contract (Tier B)

1. **Idiomatic state model per framework, audited file-by-file.** Pyreon uses
   `register` + per-field signals; React Hook Form uses uncontrolled `register`
   + `zodResolver`; TanStack Form uses controlled `form.Field` render-props +
   standard-schema validators; Formik uses controlled `useFormik` + a manual
   zod `validate` (no third-party adapter, so the schema stays shared); Vue uses
   vee-validate's `useForm`/`defineField` (an SFC-compiled template, precompiled
   at build time — see "2026-09 audit" below);
   Svelte uses Felte's `use:form` action + `@felte/validator-zod` (in a real
   `.svelte` component); Solid uses `@modular-forms/solid` (`createForm` +
   `Field` render-props, driven through the low-level `solid-js/web` API so no
   Solid-JSX transform fights Pyreon's). We **never** force one framework into
   another's pattern ("make React use signals"). Each impl is a small, readable
   file you can audit against that library's own docs.
2. **One validator, shared verbatim** (`shared/schema.ts`). The same zod schema
   feeds Pyreon's `@pyreon/validation` adapter and RHF's `@hookform/resolvers`,
   so a validation scenario measures the library's *wiring*, not the rules.
3. **Per-framework tightest commit boundary, inside the timed region.** Pyreon
   is synchronous (signal write patches the bound node — no commit hook). RHF
   uses `flushSync` so React commits synchronously within the timed region. This
   is **CPU-objective, not RHF's default async path** — RHF's real-world async
   scheduling would sit higher. Stated plainly so the number isn't over-read.
4. **Per-run reset hooks on every scenario.** Each timed run does real work:
   the keystroke scenario re-clears the field first, the reset scenario
   re-dirties all 12 fields first. Without this, only the first of 20 runs does
   work and the median is meaningless (the exact bug the DOM bench's `select`/
   `clear` ops had before the objectivity pass).
5. **DOM verification per iteration.** The value/error actually committed to the
   DOM is asserted every run; a framework that "wins" by not committing **throws**,
   it does not score.
6. **Real published deps** — real `react` / `react-dom` / `react-hook-form` /
   `@hookform/resolvers` / `zod`. **No compat shims** (the `cpa-pw-app-*` shims
   run on Pyreon's runtime and are NOT valid here — same caveat as the DOM bench).
7. **Per-framework page isolation** — each framework runs in its own fresh
   `page.goto('?framework=<name>')`, so no cross-suite heap/JIT bias.
8. **Forced GC between iterations** (`--js-flags=--expose-gc`), **adaptive warmup**
   (rolling p90 within 10%), **20 timed runs**, **median + 95% bootstrap CI + CV**,
   **tied-within-noise `🤝`** when the CIs overlap.
9. **Randomized framework execution order** per pass; **machine identity + load
   average** stamped before and after (`examples/benchmark/machine-load.ts`).
10. **Retained-heap dimension** (post-GC `usedJSHeapSize`) reported next to speed.

## The honesty contract

- **Report bundle size + retained heap next to speed — never speed alone.**
- **Don't extrapolate Tier-A primitive numbers** to a "fastest form library"
  claim. Only Tier-B supports a user-facing claim, only for the scenarios run.
- **Name where competitors win or tie.** RHF does ~0 reactive work on an
  uncontrolled keystroke, so it may match or beat Pyreon on the
  `keystroke-blur` wall-clock; `@modular-forms/solid` (a true signal peer, a
  later phase) may tie. When that happens, the table says so via `🤝` and the
  write-up states it.

## The author-judge problem (the deepest limit)

The framework author writes and judges this benchmark, and the scenario
**selection** is the lever: per-field keystroke is exactly where fine-grained
signal models shine, whole-form submit/validation is more architecture-neutral,
and there is intentionally **no scenario where a VDOM/controlled model would
structurally win** (deep prop-diffing through a large dependent tree). A slow
Pyreon impl always gets optimized; a slow competitor impl needs someone to
notice. Mitigations, in order of strength:

1. **Idiomatic-per-framework impls**, committed and reviewable (this directory).
2. **The fairness + honesty contracts above**, applied before the numbers exist.
3. The only *full* resolution is an **upstream submission to an independent
   form-benchmark** with community-reviewed implementations — out of scope here,
   the same way it is for the DOM bench. Until then, claims stop at this suite's
   evidence and do not extrapolate.

## Scenarios

The framework-agnostic contract lives in `shared/scenarios.ts` (`status: 'active'`
vs `'planned'`). Four `active` scenarios — **mount-12-fields**,
**keystroke-blur**, **keystroke-change**, **reset-dirty-form** — are implemented
identically (same ids, same shared schema) for **all seven** frameworks: Pyreon,
React Hook Form, TanStack Form, Formik, Vue (vee-validate), Svelte (Felte), and
Solid (modular-forms).

**Per-framework fairness notes (the "note if not supported" cases):**

- Felte validates on input + blur by default with no per-mode toggle, so it
  validates on every keystroke in `keystroke-blur` too. That validation is
  ASYNC and `keystroke-blur` does not wait for async work (it measures the
  value-commit path), so it runs mostly OUTSIDE Felte's blur window — an
  under-count, not an over-count. (This note previously claimed the opposite.)
  vee-validate's debounced background validation is likewise outside its blur
  window.
- vee-validate debounces schema validation by a hard-coded 5ms. In
  `keystroke-change` each keystroke waits for it (so 12 keystrokes do NOT
  coalesce into one validation), but that wait is EXCLUDED from the sample
  (`untimed()` in `runner.ts`) because it is mostly an idle timer. The Vue
  column therefore UNDER-counts its validation + error render. No other column
  excludes anything.

## 2026-09 audit (author-judge corrections)

An audit of this suite against the `examples/benchmark` standard found and fixed:

- **Vue and Svelte committed ONCE per 12-keystroke run** (one `nextTick` /
  `flushSync` after the loop) while every other column committed per keystroke,
  letting their schedulers coalesce 12 renders into 1. Now per keystroke.
- **`keystroke-change` did not wait for validation.** Every library here
  validates asynchronously, so each column's validation + error render ran
  partly outside the timed window, by an amount set by its promise-chain
  shape. Each keystroke now dispatches, commits, then `settle()`s (two
  `MessageChannel` turns, identical in every column — `runner.ts`).
- **The keystroke gates could not fail.** `input.value === TYPED` is written by
  `setInput` itself; a library that did nothing passed. The gates now read the
  LIBRARY's state and, in change mode, require the email error in the DOM.
  Doing so immediately exposed three arms that were not doing the work the
  column claimed: the Pyreon arm's `.map()` remounted all 12 fields per
  keystroke (fixed by `<For>`), and Formik + Felte render errors only for
  TOUCHED fields, so they validated but rendered nothing — the email field is
  now touched (untimed) before `keystroke-change` so every column renders it.
- **`reset-dirty-form` pre-states differed.** Arms whose `setFieldValue`
  validates rendered errors for the invalid `'dirty'` values, so their reset
  also had to clear error nodes. The pre-state is now `validValues()` (no
  errors anywhere) and is asserted; the post-reset gate reads all 12 inputs
  from the DOM for every arm (Pyreon's used to read its store).
- **Competitor arms were not on their toolchain's output.** Vue used `h()`
  render functions (no patch flags) — now an SFC-compiled template. Solid was
  hand-built with `createElement` + per-node listeners — now babel-preset-solid's
  emit (template clone + `spread` + `insert`). React-family arms used
  `createElement` — now the automatic runtime's `jsx()`/`jsxs()`. The Pyreon arm
  moved from `h()` to compiled JSX too (its own fast path).
- **Harness:** the page is cross-origin isolated and the driver aborts unless
  the clock is ≤20µs (it was Chromium's 100µs clamp — several cells were a
  handful of ticks); `--strictPort` + announced-port check; each page loads
  only its own framework (dynamic import — every page used to carry all seven
  runtimes, diluting the heap column); `NODE_ENV=production` forced for the
  build; load average stamped before/after; a framework that fails its gates is
  printed `FAILED` and exits non-zero instead of ranking first with a 0µs
  median.

Numbers taken before these fixes are not comparable with numbers after them.

## Roadmap (remaining phases — honest about what is NOT here yet)

All seven frameworks are covered for the four active scenarios (speed + retained
heap). Still to come, each a reviewable increment:

- **`validate-submit-invalid`** — currently `status: 'planned'`. Deferred
  because the React libs commit error state through React's async path, which
  needs a fair `act()`/commit boundary to compare cleanly against Pyreon's
  synchronous error patch. Adding it to *all* columns or none is the rule; it
  ships when the React commit boundary is made fair.
- **Bundle size beyond the React ecosystem** — `bundle-size.ts` currently covers
  Pyreon + the React libs (no compile step needed). Vue (vee-validate) + Solid
  (modular-forms) can be added the same way; Svelte needs the `.svelte` compile
  wired into the size measurement — tracked.
- **More scenarios** — field-array append/remove/reorder, cross-field
  validation, bulk programmatic setValues, isolation/re-render-scope proof.

## Bundle size (shipped — `bun bundle-size.ts`)

The second half of the real-world story, reported next to speed. For each
framework (Pyreon + React libs + Vue + Solid; Svelte's `.svelte` compile in the
size measurement is tracked in the Roadmap) we production-minify + gzip two
entries: BASELINE (runtime only) and FULL (runtime + form lib + zod adapter + a
12-field validated form); the **DELTA** is the marginal cost of adding a
validated form (zod is in every FULL, so it cancels across columns). The TOTAL
is what the user downloads.

Representative (Bun.build, gzipped) — BASELINE / FULL / DELTA:

| framework | baseline | full | delta |
| --- | --- | --- | --- |
| Solid (modular-forms) | 4.5 KB | **72.5 KB** | 68.0 KB |
| Pyreon | 11.9 KB | 77.7 KB | **65.8 KB** |
| Vue (vee-validate) | 24.5 KB | 95.3 KB | 70.7 KB |
| React Hook Form | 57.7 KB | 132.1 KB | 74.4 KB |
| Formik | 57.7 KB | 133.9 KB | 76.3 KB |
| TanStack Form | 57.7 KB | 139.5 KB | 81.8 KB |

Honest read: **Solid's TOTAL is smallest** (its 4.5 KB runtime undercuts even
Pyreon's lean 11.9 KB), while **Pyreon's marginal form DELTA is smallest** — the
two signal libs are the clear bundle leaders, both ~1.7–1.9× lighter than the
React trio. The form-wiring DELTA is within ~1.2× across every column (zod
dominates it), so the spread is almost entirely the runtime, not the form lib.
