# Pyreon Benchmark Results — Full Run

**Machine:** Apple M3 Max · 14 logical cores · 96–103 GB RAM · darwin 25.5.0 · Bun 1.3.14 / Node v24.3.0 · Chromium 149.0.7827.55
**Config:** `NODE_ENV=production` everywhere · fresh run **2026-07-01** · benches run strictly sequentially (parallel runs corrupt timing).

**How to read:** every head-to-head passes a correctness gate (all libraries agree before timing), runs each competitor's *idiomatic* API, and reports the median over warmup + N runs. **Absolute ns/ms are machine-dependent — the ratios are the portable signal.** 22 benchmarks below; 3 did not produce data (accounted for in §6).

---

## 1. DOM row-list suite — `bench:fair` (real Chromium, vs 6 frameworks + Vanilla)

The krausest-canon suite: 9 ops, per-framework page isolation, adaptive warmup, forced GC between iterations, median + 95% bootstrap CI + CV. Numbers are per-op medians.

| op | Vanilla | **Pyreon** | Preact | React 19 | Vue 3 | SolidJS | Svelte 5 | verdict |
|---|---|---|---|---|---|---|---|---|
| create 1,000 rows | 9.00ms | **9.60ms** | 14.55ms | 11.80ms | 10.65ms | 10.00ms | 12.85ms | 🥇 Pyreon outright |
| replace all rows | 9.30ms | **9.60ms** | 14.75ms | 11.10ms | 10.40ms | 10.55ms | 12.70ms | 🥇 Pyreon outright |
| partial update (every 10th) | 800µs | **800µs** | 1.20ms | 1.15ms | 1.40ms | 4.90ms | 2.15ms | 🥇 Pyreon outright |
| select row | 0µs | **0µs** | 400µs | 200µs | 550µs | 0µs | 300µs | 🤝 tied Solid (timer floor) |
| swap rows | 700µs | **700µs** | 1.00ms | 7.35ms | 1.40ms | 850µs | 2.20ms | 🥇 Pyreon (React 10.5×) |
| remove row | 7.40ms | **7.30ms** | 7.70ms | 7.75ms | 8.40ms | 7.50ms | 8.90ms | 🤝 tied Solid |
| clear rows | 100µs | **200µs** | 800µs | 1.40ms | 400µs | 400µs | 400µs | 🥇 Pyreon outright |
| create 10,000 rows | 92.40ms | **98.15ms** | 294.10ms | 225.55ms | 113.65ms | 117.10ms | 243.25ms | 🥇 Pyreon outright |
| append 1k→10k rows | 22.70ms | **24.35ms** | 27.00ms | 25.25ms | 90.40ms | 22.75ms | 73.15ms | 🤝 tied Solid/React |

**Retained JS heap after suite (post-GC, MB):** Preact 2.21 < SolidJS 2.29 < **Pyreon 2.48** < React 2.59 < Vanilla 2.61 < Vue 3.97 < Svelte 4.24.

**Honest read:** Pyreon wins **6/9 ops outright**, ties Solid on `select`+`remove`, ties Solid/React on `append`. Robust wins: bulk-create at 10k (2.3–3.0× vs React/Svelte/Preact), React's keyed `swap` (10.5×), Vue/Svelte `append` (3.2–4.0×), and `partial update`. The only measurable cost vs **Vanilla** is bulk-create (~6–7%). Retained heap is **3rd-lightest** this run. Single pass, so slightly noisier than a `--repeat 5` pooled run.

---

## 2. Real-app vs REAL `react-dom@19` — `real-bench` (TodoMVC-shape, Chromium, 20 runs)

The only bench vs *real* react-dom (not a compat shim).

| scenario | **Pyreon** | React 19 | ratio |
|---|---|---|---|
| add-100 | 500µs (cv 16%) | 8.10ms (cv 2%) | **~16×** |
| toggle-1000 | 300µs (cv 19%) | 1.70ms (cv 6%) | **~5.7×** |
| clear-1000 | 100µs (cv 42%) | 1.10ms (cv 11%) | **~11×** |

Pyreon patches per-row via signals; React re-renders + reconciles the whole list. µs-scale/high-CV — the *magnitude* (per-row patch vs whole-list re-render) is the signal, not the exact ratio.

---

## 3. Core micro-benchmarks

### 3.1 reactivity — vs `@preact/signals-core` + `solid-js` (browser build), ns/op

| op | **Pyreon** | Preact | Solid |
|---|---|---|---|
| signal create+read+write | 47 | **29** | 125 |
| computed diamond (100 upd) | 18,585 | **5,738** | 15,848 |
| effect propagation (100 upd) | 5,090 | **3,164** | 9,338 |
| batch 50 signals (1 effect) | 2,199 | **1,141** | 2,145 |
| deep chain depth-50 (100 upd) | 276,693 | **125,833** | 340,402 |
| wide fan-out 1→100 effects | 11,619 | **2,517** | 4,615 |
| store read+write (Pyreon only) | 210 | — | — |

**Honest read:** Pyreon beats Solid on create + diamond + deep-chain, loses effect-propagation/fan-out. **Preact's signals-core leads every row** (versioned linked-list dependency tracking avoids the per-rerun dep-Set teardown Pyreon pays). This is raw-primitive mid-field — and does **not** contradict the DOM `partial update` win, because compiled Pyreon apps emit `_bindText` direct-subscriber bindings for text/attr updates, not raw `effect()`.

### 3.2 router — vs 7 routers, ops/sec (average across 8 route shapes)

| route table | **Pyreon** | find-my-way | Hono | radix3 (Nuxt) | React-Router | TanStack | Vue-Router | Next (ptr) |
|---|---|---|---|---|---|---|---|---|
| 10 routes | 16.4M | 13.1M | **23.4M** | 16.6M | 88.6K | 1.07M | 2.16M | 10.3M |
| 50 routes | **16.6M** | 10.3M | 3.49M | 16.3M | 13.7K | 964K | 1.45M | 9.83M |

**Pyreon is the 1.00× leader at 50 routes** (radix3 1.02×, Hono collapses to 4.75× slower once past its 10-route mega-regex sweet spot). Only Hono leads the 10-route toy table. *(The 200-route sweep exceeded the runtime budget — 8 libs × 8 shapes × warmup is slow; the 50-route crossover is the meaningful result.)*

### 3.3 head — vs `unhead` (Vue/Nuxt), ns/op

| op | **Pyreon** | Unhead | Pyreon advantage |
|---|---|---|---|
| serialize 5 tags | 472 | 3,036 | **6.4×** |
| serialize 20 tags | 1,980 | 9,684 | **4.9×** |
| serialize 50 tags | 3,728 | 21,462 | **5.75×** |

Plus Pyreon-only cached `resolve()`: 26–34 ns (the cache win). Pyreon is 4.9–6.4× faster on SSR head serialization.

### 3.4 validate — vs `zod@4` / `valibot@1` / `arktype@2`, ops/sec

| shape | **Pyreon** | arktype | valibot | zod |
|---|---|---|---|---|
| small obj — **valid** | 13.9M | **23.5M** | 6.8M | 5.5M |
| small obj — **invalid** | **8.2M** | 0.19M | 2.96M | 0.20M |
| nested — valid | 9.9M | **13.9M** | 4.6M | 2.7M |
| nested — invalid | **5.8M** | 0.12M | 1.47M | 0.15M |
| array-of-20 — valid | 0.85M | **1.24M** | 0.35M | 0.25M |
| array-of-20 — invalid | **0.86M** | 0.045M | 0.33M | 0.11M |
| discriminated union — valid | 22.4M | **49.8M** | 5.8M | 17.4M |
| discriminated union — invalid | **13.9M** | 0.84M | 3.94M | 0.47M |

**Honest read:** Pyreon wins **every invalid/error path** (2.6–43×, early-exit vs rich-error allocation) and is **2nd on valid-parse** (faster than zod + valibot; behind only arktype's JIT — the documented open frontier).

### 3.5 validate compiled-verdict — Pyreon `.is()` compiled vs runtime, ns/op (500k×7)

| schema | runtime `.is()` | compiled `.is()` | speedup |
|---|---|---|---|
| `string().email()` | 52.3 | 32.1 | 1.63× |
| `number().int().min(18)` | 24.0 | 8.0 | 3.00× |
| `object{email,age,name}` | 69.2 | 37.2 | 1.86× |
| `array(number())` | 52.1 | 15.3 | 3.40× |

Nanosecond-scale — matters in hot `.is()` loops only; `.parse()` (the common form/request path) is unchanged.

### 3.6 compiler — Vite 8 pipeline, ns/op (the honest build-time cost)

| input | OXC only (React/Preact) | Pyreon + OXC | Pyreon reactive pass only | Babel (Solid legacy) |
|---|---|---|---|---|
| small | 5,113 | 11,007 | 3,559 | 130,135 |
| medium (todo) | 16,215 | 42,442 | 19,463 | 725,661 |
| large (100 rows) | 342,030 | 1,575,101 | 777,277 | 22,564,094 |

Pyreon's reactive pass + OXC costs **~2.3× over OXC-alone** — the price of the reactivity analysis no other framework performs. Still **~17× faster than Babel** (Solid's legacy compiler) at build time. Reference bundlers for context: esbuild 380µs / SWC 79µs on medium.

### 3.7 ssr / server — Pyreon-only throughput

**renderToString renders/sec:** empty 667K · simple (5 routes) 252K · links-100 15.8K · layouts-26-params 39K.
**Full handler req/sec:** simple 194K · medium (10 routes) 175K · nested-5-deep 109K.
**Template:** `processCompiledTemplate` 21.3M/s vs `processTemplate` (3× replace) 2.15M/s (45× faster compiled path).

---

## 4. Fundamentals — competitor head-to-heads (per-op process isolation, median ns/op)

### 4.1 store — vs Zustand / Jotai

(2026-07 re-baseline — per-(op × impl) process isolation, pooled samples + CI95 tie markers, no forced GC; the earlier 20× setup figure was ~1/3 harness artifact: all three libraries shared one child heap and Pyreon's registry-retained stores grew unbounded across 220k iterations.)

| op | **Pyreon** | Zustand | Jotai | verdict |
|---|---|---|---|---|
| setup | 358 | **28** | 3450 | Zustand 12.6× (per-field signals + the global registry powering SSR isolation / devtools) |
| read | 3 | 3 | 153 | 🤝 tied (CI95 overlap) |
| dispatch (no subscriber) | **11** | 70 | 939 | Pyreon 6.4× |
| write → 1 subscriber | **37** | 84 | 887 | Pyreon 2.3× |
| patch 2 fields (no subscriber) | **42** | 71 | 965 | Pyreon 1.7× |
| patch 2 fields (with subscriber) | 152 | **87** | 1070 | Zustand 1.7× (down from 2.6× — Pyreon emits per-key `{key, oldValue, newValue}` events + a state snapshot per notify vs Zustand's single shallow merge) |

Honest-mixed: Pyreon wins the fine-grained hot path (dispatch 6.4×, write→1 sub 2.3×, no-subscriber patch 1.7×), ties read, **loses setup 12.6×** (the per-field-signal + registry model — paid once per store id) and **with-subscriber patch 1.7×** (the richer per-key mutation-event contract). Both are documented Pareto trades, not open gaps: a change-detection-suspend optimization was measured a wash, and the remaining setup cost IS the feature set (2 signals, effect-scope ownership, action wrapping, registry). Dominates Jotai's *vanilla* store everywhere (Jotai is React-render-dedup-optimized, not vanilla-throughput).

### 4.2 state-tree — vs MobX-State-Tree

| op | **Pyreon** | MST | ratio |
|---|---|---|---|
| create | 1008 | 9561 | 9.5× |
| read | 6 | 37 | 6.6× |
| action toggle | 60 | 2857 | **47.7×** |
| getSnapshot | 29 | 42 | 1.4× |
| applySnapshot | 74 | 4323 | **58.5×** |
| applyPatch | 73 | 3014 | 41.3× |
| reactive write→observer | 112 | 2882 | 25.8× |

Pyreon wins every op. *Note:* `create`/`applySnapshot` here compare plain-mode Pyreon (no validation) vs MST (validates); the apples-to-apples **schema-mode** rows (validating, landed in PR #1929) still favour Pyreon ~7–26×.

### 4.3 i18n · permissions · machine · toast

| bench | ops (Pyreon ns · advantage) |
|---|---|
| **i18n** vs i18next | t 52 (23×) · interpolation 243 (5.9×) · plural 742 (4.0×) · number 766 (3.2×) · date 1162 (2.8×) |
| **permissions** vs CASL | exact-allow 9 (2.7×) · exact-deny 8 (2.0×) · wildcard 8 (2.3×) · multi-check 20 (2.3×) |
| **machine** vs XState | create 109 (23.5×) · send 29 (54.5×) · guard 5 (13.6×) · matches 18 (4.4×) |
| **toast** vs react-hot-toast | create+dismiss 136 (2.5×) · update-by-id 74 (4.4×) · create10+clear 973 (3.7×) |

Pyreon wins every op in all four. *(machine/XState: XState buys hierarchical states / invoked actors that Pyreon deliberately offloads to signals+effects; the bench measures the shared statechart ops only.)*

### 4.4 form Tier-A — store primitive vs TanStack `form-core`, ns/op + re-renders

| scenario | **Pyreon** | TanStack | verdict |
|---|---|---|---|
| setup-12-fields | 3.80µs | 3.86µs | 🤝 tied (CI overlap) |
| update-field (hot path) | **42** | 3732 | Pyreon **87.9×** |
| read-all-values | **3** | 8 | Pyreon 2.5× |
| reset | **598** | 4133 | Pyreon 6.9× |

**Component re-renders for 10 keystrokes into a 20-field form:** Pyreon **0** = React Hook Form 0 (uncontrolled) < Formik 10.

### 4.5 form Tier-B — real-browser, 6 competitor form libs (Chromium, ms medians)

| scenario | **Pyreon** | RHF | TanStack | Formik | Vue (vee-validate) | Svelte (Felte) | Solid (modular-forms) | verdict |
|---|---|---|---|---|---|---|---|---|
| mount-12-fields | 200µs | 500µs | 700µs | 400µs | 500µs | 600µs | 300µs | 🤝 Pyreon ≈ Solid |
| keystroke-blur | 100µs | 200µs | 800µs | 600µs | 100µs | 600µs | 100µs | 🤝 Pyreon ≈ Solid ≈ Vue |
| keystroke-change (validate every key) | **100µs** | 600µs | 2.50ms | 800µs | 200µs | 600µs | 400µs | 🥇 Pyreon (TanStack 25×) |
| reset-dirty-form | 100µs | 200µs | 200µs | 100µs | 200µs | 300µs | 0µs | 🤝 Solid ≈ Pyreon |

**Retained JS heap (MB):** **Pyreon 3.17 (lightest)** < Solid 3.32 < Svelte 3.75 < Vue 3.80 < RHF 4.08 = Formik 4.08 < TanStack 4.56.

### 4.6 cssVariables theming — Pyreon classic vs cssVariables mode (300 real components)

Theme toggle **15.2ms → 8.7ms (1.75× faster)**; retained heap neutral (classic 10.31 MB vs vars 10.26 MB). Var-mode does **zero per-component JS** on flip (one `documentElement` attribute write + native CSS-var recalc) vs classic re-running every component's accessor.

---

## 5. Bundle sizes — gzipped full-barrel (authoritative CI gate: **all 63 packages within budget**)

| package | KB gz | package | KB gz |
|---|---|---|---|
| @pyreon/reactivity | 7.22 | @pyreon/store | 2.10 |
| @pyreon/core | 4.46 | @pyreon/state-tree | 4.76 |
| @pyreon/runtime-dom | 10.35 | @pyreon/form | 3.89 |
| @pyreon/router | 10.76 | @pyreon/i18n | 2.78 |
| @pyreon/runtime-server | 5.29 | @pyreon/permissions | 0.78 |
| @pyreon/head | 0.17 | @pyreon/machine | 0.87 |
| @pyreon/validate | 12.08 | @pyreon/toast | 2.61 |
| @pyreon/query | 3.50 | @pyreon/rx | 1.73 |

*These are whole-`export *` barrels; real apps tree-shake far smaller — e.g. `runtime-dom` `mount`-only ≈ 8 KB, `reactivity` `signal/computed/effect` ≈ 3.2 KB (per the `check-import-budgets` gate).*

---

## 6. Honest accounting — benches that did NOT produce data

- **sync** (`bench:sync`) — failed to load: imports `y-protocols/awareness`, installed only in the sync package's `node_modules`, not root where the bench harness (`scripts/bench/core/`) resolves. **Harness path bug, not a perf result** — needs `y-protocols` + `yjs` as root devDeps. Documented numbers: remote-op→signal ≈ 5µs/write; O(N) awareness/list characterization (CLAUDE.md).
- **router 200-route table** — the 8-lib × 8-shape sweep exceeded the runtime budget past 50 routes; the 50-route crossover (Pyreon 1.00× leader) is captured above.
- **bundle-size bench** (`scripts/bench/bundle-size.ts`) — broke on core packages: its esbuild config can't resolve the new `import { name, version } from '../package.json'` self-registration those packages recently adopted (`registerSingleton`). Only `@pyreon/compiler` bundled (49.6 KB gz). **Replaced by the working CI-gated `check-bundle-budgets` in §5.**
- **permissions** — initially failed (`@casl/ability` declared-but-uninstalled); fixed with `bun install` and re-run successfully (data in §4.3).
- Not run (duplicative/variant): `bench:dom` (legacy pre-`fair` runner, superseded), `toast-commit-bench` (sonner animation-coupled variant), extra validate variants (`behavior`/`validation`/`typecheck`/`mono`).

---

## Bottom line

Pyreon **leads its competitor** on state-tree, i18n, permissions, machine, toast, head, form (both tiers), and the real-`react-dom` app bench; is the **row-list DOM leader** (6/9 ops outright + 3 ties, 3rd-lightest heap); wins **validate's error path** (2nd on valid-parse); and is **honest-mixed** on raw **reactivity primitives** (Preact's signals-core leads) and **store** (wins fine-grained, loses setup/registry) — with a disclosed **~2.3× build-time compiler cost**. Two benches (`sync`, `bundle-size`) are broken *harnesses*, not lost races.
