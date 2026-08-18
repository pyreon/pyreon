---
name: pyreon-benchmarks
description: Pyreon's measured benchmark standings and the measurement protocol that produced them — the krausest-style DOM suite, core micro-benchmarks, per-library head-to-heads, retained-heap numbers, and the honest limits (author-judge, synthetic-not-real-app). Load before making, changing, or reviewing ANY performance claim, before running a benchmark, and before writing a perf number into docs. Carries the traps: never force GC in JSC, never run benches concurrently, NODE_ENV=production before framework imports.
---

# Pyreon Benchmark Results and Measurement Protocol

> Extracted verbatim from CLAUDE.md. This is the authoritative copy — edit it here.

**Pyreon (idiomatic JSX) is competitive with the fastest frameworks on a synthetic krausest-style row-list benchmark** (Chromium via Playwright). [Octane](https://octanejs.dev) is the nearest rival — statistically tied with Pyreon on most ops, winning `clear rows` outright (a real, architectural gap that a pending fix narrows to ~1.15× without closing — see "`clear rows`: the corrected diagnosis" below), and losing `create 10,000` and `append` outright to Pyreon. Treat "fastest framework" as a claim about *this* suite with a live challenger, not a settled fact, and treat "leads" as "ties or wins two ops," not a sweep.

**Revision history — eight corrections made to this repo's OWN benchmark record during the 2026-08 campaign.** Five (below) were artifacts in the benchmark harness itself, every one of which had inflated a Pyreon number. **The sixth runs the other way** — a real framework fix (PR #2895) that a published Pyreon-unfavorable figure hadn't caught up to yet — and is corrected with the same rigor anyway, because auditing a number only when it makes Pyreon look worse is the same dishonesty as auditing one only when it flatters Pyreon. **The eighth runs in the usual direction again** — a published "statistical tie with Vue" on hydration was measured on a noisy machine and did not survive a quiet re-run, which found a real Vue lead in its place; the cause here is measurement conditions rather than a harness bug, but the retraction is made with the same explicitness regardless. Each is retracted explicitly, not silently corrected, per this file's standing discipline:

1. **Octane's row id rendered `{String(row.id)}`** (own idiomatic form passes the raw number) disabled its compiler `forBlock` fast path — PR [#2897](https://github.com/pyreon/pyreon/pull/2897).
2. **Five implementations' `String(row.id)` calls inflated V8's `smi_string_cache`**, which the retained-heap metric charged to the framework instead of the engine — PR [#2899](https://github.com/pyreon/pyreon/pull/2899).
3. **`create`/`replace` are browser-layout-bound**, and the suite's `create N rows` op measures a REPLACE 19 of 20 sampled runs (no `reset`, monotonic row ids) — see "create/replace are layout-bound" below.
4. **`append` was measured bimodal** by a harness that couldn't resolve sub-millisecond timing precisely enough to see it — PR [#2894](https://github.com/pyreon/pyreon/pull/2894) (finer timer) + PR [#2901](https://github.com/pyreon/pyreon/pull/2901) (bimodality guard).
5. **The bench fixture used `table-layout: auto`**, so any op that widens a table cell forced Chromium to re-measure column widths across all live rows — this is what actually CAUSED artifact 4's bimodality, and it separately inflated the Pyreon-vs-Solid `partial update` margin ~2.3×over its true size — PR [#2903](https://github.com/pyreon/pyreon/pull/2903). See "the `partial update` retraction" and "append, final" below.
6. **The published deep-tree-mount loss (1.56×) was measured against Pyreon's PRE-#2895 code.** PR [#2895](https://github.com/pyreon/pyreon/pull/2895) (`jsx()` zero-copy + single-pass `makeReactiveProps`) landed after that figure was captured; re-measuring the same three-way comparison on current main narrows the loss to **1.36×**. Pyreon still loses this op outright — only the magnitude changed. See "Deep-tree mount, re-measured post-#2895" below.

7. **`clear rows`' accepted diagnosis — "2 mandatory per-row disposals, the disposal chain already at its floor" — was wrong by more than an order of magnitude.** A subtree-attributed CDP profile found the real cost was a `createSelector` per-key registry duplicating the reconciler's own key map (~11µs), not the per-row signal teardown beside it (~0.9µs); a second frame the old decomposition counted separately was V8 inlining that same registry work into its caller, one cost read as two. Three prior investigations inherited the diagnosis rather than re-measuring it, and each declined to look further because the question read as closed — PR [#2912](https://github.com/pyreon/pyreon/pull/2912) (open). See "`clear rows`: the corrected diagnosis" below.
8. **The published hydration "statistical TIE with Vue in the cleanest run" was measured at load 8.2 and does not survive a quiet re-run.** Re-measured at load 2.2–2.5 (n=60 pooled × 4 independent runs, `crossOriginIsolated` verified with a real 5.0µs quantum, page-loaded bundle hash asserted equal to the on-disk build hash): CI95 is **disjoint in all four runs**, and the honest verdict is a real, small **Vue LEAD of ~3–4%**, not a tie. The wider CI at load 8.2 was masking the gap, not proving its absence. See "Hydration, re-measured on a quiet machine" below.

**Status: LANDED.** All seven PRs the board was measured against are now merged into `main` — #2893 (drop a discarded per-row closure), #2894 (finer timer), #2895 (deep-tree-mount fix, unrelated to this board), #2897 (Octane un-handicap), #2899 (row-id normalization), #2901 (bimodality guard), #2903 (table-layout). **#2896 was excluded** — it only touches the deep-component-tree scenario, not the row-list suite. The numbers below therefore describe `main` as it stands, not a pending destination. They have NOT been re-run as a single post-merge confirmation pass; the individual measurements were each taken against a tree carrying the full set, so a confirmation run is a nice-to-have rather than a correctness gap.

**FINAL corrected field (post-#2903, table-layout fixed)**, `--repeat 5`, 100 pooled samples/op:

| op | Vanilla | Pyreon | Octane | Vue | Solid | Svelte | React | Preact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| create 1,000 | 7.47 | 8.01 | 7.95 | 8.06 | 8.82 | 8.97 | 10.23 | 11.83 |
| replace all | 7.45 | 7.92 | 7.84 | 8.03 | 8.60 | 8.86 | 9.98 | 11.75 |
| partial update | 720µs | 650µs | 700µs | 1.03 | 1.39 | 1.25 | 890µs | 1.01 |
| swap | 690µs | 760µs | 850µs | 1.06 | 890µs | 1.39 | 6.10 | 1.00 |
| remove | 6.14 | 6.24 | 6.26 | 6.47 | 6.26 | 7.02 | 6.60 | 6.74 |
| clear | 90µs | 160µs | 110µs | 230µs | 440µs | 280µs | 1.05 | 740µs |
| create 10,000 | 75.25 | 80.28 | 83.40 | 87.70 | 98.30 | 95.90 | 209.60 | 266.70 |
| append 1k→10k | 13.68 | 14.24 | 16.27 | 70.98 | 16.17 | 21.22 | 17.75 | 18.09 |

(ms unless noted. `select row` is untouched by this fix — no cell widens on
that op — so its figures are unchanged: Pyreon 1.030/0.960/0.685µs vs Octane
1.370/1.525/1.150µs at 100/1,000/10,000 rows.)

**Verdicts on the FINAL board.** `create 10,000` **OUTRIGHT PYREON** vs Octane (80.28 vs 83.40, ~3.9% — this margin WIDENED from the pre-#2903 board's ~1.6%). `append` **OUTRIGHT PYREON**, WIDER than previously published (see "append, final" below). `clear rows` **PYREON LOSES** to Octane (160µs vs 110µs, ~1.45×, consistent with the pre-#2903 finding — this op doesn't widen cells, so the layout fix barely moved it; a separate open PR, #2912, narrows this to ~1.15× without closing it — see below). `partial update`, `create 1,000`, `replace all`, `remove` remain plausible ties with Octane by the same small-percentage-gap pattern the pre-#2903 board showed CI95-overlapping — **this handoff's board is point estimates only, without fresh CI bounds for every cell**, so treat these four as "still a tie, pending re-verification with CI once the PRs land and a CI-bearing run is produced," not a newly re-adjudicated fact. `swap`'s relative gap widened (Pyreon 760µs vs Octane 850µs vs Solid 890µs, was a tighter 3-way tie pre-fix) — plausibly no longer a tie, but likewise unconfirmed without CI; do not publish it as a win until re-verified.

**`partial update` — THE RETRACTION THAT MATTERS MOST: our published ~4.9× lead over Solid was inflated ~2.3× by the table-layout bug, and must be retracted as explicitly as the Octane/retained-heap artifacts.** `partial update` appends `" !!!"` to a cell's text on every 10th row, WIDENING that cell — under `table-layout: auto` this forced Chromium to re-measure column widths across the WHOLE table, and it penalized Solid disproportionately: Solid drops **4.03ms → 1.39ms (−66%)** on the fix, while every other framework drops only 15–24%. **The record has published "Solid 3.90–3.98ms, ~4.9× Pyreon lead" — that number is wrong. The corrected margin is Pyreon 650µs vs Solid 1.39ms, ~2.1×.** Do not repeat the retracted 4.9× figure anywhere; the true, still-real Pyreon lead on this op is ~2.1×, not a null result — Solid's effect-based `insert` is still slower than Pyreon's `_bindText` direct-subscriber path, just by less than half of what was previously claimed.

**`append`, final: still OUTRIGHT PYREON, margin WIDENED, and vs-Vanilla is now publishable — this supersedes the "1.04×, no vs-Vanilla ratio" figures reported earlier in this campaign.** Two independent `--repeat 5` runs on the table-layout-fixed board both land Pyreon **OUTRIGHT and CI-disjoint**, at **1.14–1.20×** (run 1: Pyreon 14.24ms vs Octane 16.27ms = 1.14×; run 2: Pyreon 14.11ms vs Octane 16.95ms = 1.20×) — WIDER than the previously-reported 1.04×, because a large shared additive layout constant left both sides once the table stopped re-measuring on every append. The bimodality guard (#2901) now passes CLEAN across the whole board: **7 bimodal cells → 0**, every framework 100/100 fast-mode samples, CV 29–43% → **3–7%**. Because Vanilla's own median no longer straddles two timing modes, **a vs-Vanilla ratio is now honest and published**: Pyreon **+4.1% (run 1) / +5.7% (run 2)** over hand-written Vanilla — the earlier instruction in this file to NEVER publish this ratio is superseded specifically because the bimodality that made it dishonest is now fixed at the root.

Three caveats travel with the append figure and must be encoded wherever it's quoted, not just attached once: **(1)** even fixed, `append` is **~90% layout** (Pyreon's own JS `fn` is 1.48ms of a 14.47ms total) and all eight implementations emit **byte-identical DOM** (verified: 3 elements + 2 text nodes per appended row) — the defensible claim is *end-to-end append cost including the layout it causes*, **NOT** "Pyreon's reconciler is 1.14× faster" (there is no reconciler-only signal here; layout dwarfs it, same shape as the create/replace finding below). **(2)** the fixture is now **less representative of real apps**, which commonly DO use auto-layout tables and pay this cost — fixing it to `table-layout: fixed` (scoped to `.bench-fixture`, identical policy for all eight impls) is the right trade for a *comparison* specifically because auto-layout's cost is random-data-triggered and destabilizing (bimodal, not a stable framework signal) — state this trade-off, don't hide it. **(3)** these are pending numbers (see the "Status" note above) — do not present the append win as settled until #2903 and its siblings land.

**A refuted diagnosis, worth recording as a methodology lesson.** Before the `table-layout` root cause was found, append's bimodality was attributed to RESIDUE from the preceding `create 10,000` op (leftover DOM/heap state biasing later timed runs), with fresh-fixture / fresh-page / benchmark-reordering proposed as fixes. **Measurement refuted the theory outright**: append run with NO preceding op at all is 54.53ms and 60/60 SLOW; with only `create 10,000` run before it, 21.11ms and ~50/50; with the full suite run before it, 20.15ms and 90% FAST. **More preceding work produced MORE fast samples — the exact opposite of what a residue theory predicts.** Had any of the proposed fixes (fresh fixture, fresh page, reordering) shipped on that diagnosis, they would have made the benchmark WORSE, not better, while looking like a principled fix. The lesson: a plausible-sounding causal story for an anomaly is a hypothesis, not a fix — measure it before touching the harness on its strength alone.

**`create`/`replace` are LAYOUT-BOUND, and `create N rows` is measuring a REPLACE 19 times out of 20 — a separate, compounding finding in the same family as the table-layout root cause above.** A profiling pass (pre-#2903 board; the qualitative finding is unaffected by the table-layout fix, since it concerns the `getBoundingClientRect()` flush every `create`/`replace` op pays regardless of table-layout mode) split `bench()`'s timed region — which times `fn()` PLUS a forced layout flush in the SAME window — into JS and layout on a production build:

| | JS | layout | total |
| --- | ---: | ---: | ---: |
| Pyreon | 1.13ms | 7.12ms | 8.24ms |
| Vanilla | 810µs | 7.26ms | 8.07ms |
| Δ | +317µs | −145µs | +172µs |

Layout is ~86% of the op and is **statistically identical between arms** — layout Δ across three reproductions was −58µs, −278µs, −145µs: noise around zero, LARGER in magnitude than the entire framework JS gap. **The honest statement about the `create 1,000` / `replace` TIES is therefore not merely "within CI" — the op is browser-bound, and this instrument structurally cannot separate the frameworks there.** The only real, tightly-reproducing signal is the JS term itself (Δ +318µs, +285µs, +317µs across three runs) — a genuine, real framework-attributable JS cost vs hand-written Vanilla, **~+28% on the JS term**, that is nonetheless **invisible in wall clock** because it is swamped by ~7ms of layout neither framework controls. **This is not a win claim, and not a loss claim either — it is a statement about what the instrument can and cannot see.** Separately: the harness has no `reset` between runs and row ids come from a monotonic counter, so of the 20 timed runs per op, only the FIRST mounts into an EMPTY list — the other 19 hand a keyed reconciler N brand-new keys against N rows STILL LIVE in the DOM, which is structurally a REPLACE, not a create. This is why `create` and `replace` report nearly identical medians on BOTH the pre- and post-#2903 boards — for the vast majority of sampled runs, they are the same operation. State this plainly wherever `create 1,000` / `create 10,000` is quoted: a reader reasonably assumes a fresh empty-DOM mount, and for 19 of 20 sampled runs that assumption is wrong. Do not quote a wall-clock create/replace percentage as a "framework cost" without both caveats; the ~7.2%/~6.7% wall-clock cost-vs-Vanilla figures on the FINAL board (create-1k/create-10k) are real MEASUREMENTS but are dominated by this same layout noise, not a clean JS-cost signal.

**The ties on `create`/`replace`/`remove` are STRUCTURALLY unbreakable by framework work, and the arithmetic says so plainly.** A CDP subtree profile of `create 10,000` (2026-08-18) puts Pyreon's whole JS commit at **1,230.7µs** against Vanilla's **626.3µs** — so the ENTIRE framework overhead over hand-written DOM is **604µs, which is 0.68% of the ~89ms op**. Removing every last nanosecond of mount machinery could not move that op by one percent, because the remainder is DOM construction and layout that every entry pays identically. Concretely: `warnForKeyIn`, the largest single optimisation candidate the profile surfaced, is 39.2µs — **3.2% of framework JS but 0.044% of the op**. Treat "we are tied with Octane on create/replace/remove" as a statement about the WORKLOAD, not about remaining headroom: these ops are browser-bound, and the honest read is that the suite cannot rank frameworks there at all. The ops where framework work genuinely dominates, and therefore where a real win is available, are the sub-millisecond ones (`clear rows`, `partial update`, `swap`, `select`) and the component-pipeline ones (deep-tree mount) — target those, and stop re-litigating the layout-bound ops.

**Standing caveat, same investigation: a profiling driver can itself silently misreport, same class as this repo's "gate that could not fail" entries.** The attribution drivers used for the JS/layout split above initially printed `0.0µs` for every JS-side sample — attribution keyed on `Function.name`, and a minified production build strips function names, so every lookup silently missed and fell back to a plausible-looking zero instead of failing. Both drivers now REFUSE to report an empty attribution (non-zero exit) rather than silently printing `0.0µs`. General rule, same as the CI aggregate-gate entries: a measurement path that can degrade to a fake-looking valid number must be made to fail loudly instead.

**Robust bulk-create margins, re-measured on the FINAL board (WIDENED, not narrowed, by the table-layout fix):** create-10,000 is **~2.6× faster than React** (was ~2.4×) and **~3.3× faster than Preact** (was ~3.1×) — Pyreon 80.28ms vs React 209.60ms vs Preact 266.70ms. Svelte create-10k is essentially unchanged at **~1.19×** (95.90/80.28) and Vue at **~1.09×** (87.70/80.28, up slightly from ~1.06×). `swap` vs React widened to **~8.0×** (6.10/0.76, was ~7.3×). `append` vs Vue widened to **~5.0×** (70.98/14.24, was ~4.1× — Vue's append stays genuinely slow; unaffected by the append bimodality fix since Vue was never in either timing mode's fast cluster). **Per-row DATA MODEL differs by framework, deliberately** — Pyreon and Solid allocate a per-row signal for the label; Octane/React/Preact/Vanilla use plain objects and re-render — so Pyreon's create medians include signal-allocation cost the `useState`-model entries never pay, and Pyreon still takes create-10k outright anyway; do not "fix" this by giving the Pyreon entry plain objects.

**Corrected retained heap** (unaffected by the table-layout fix — CSS layout mode has no bearing on JS heap retention): Vanilla 2.38 · Preact 2.50 = **Pyreon 2.50** · Solid 2.53 · Octane 2.69 · Svelte 2.70 · Vue 2.71 · React 2.89 MB. Pyreon is **3rd of 8 and TIED with Preact — not "2nd among frameworks"** (a tie has no ordinal — that framing is retracted per artifact #2 above; full mechanism in "The Preact retained gap is V8's number-string cache" below). Do not repeat "2nd among frameworks on retained memory" anywhere until #2899 has merged and been re-verified — and even then, say "tied with Preact," not "2nd."

| Benchmark | Vanilla | **Pyreon** | Vue 3 | Solid | React 19 | Svelte 5 | Preact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Create 1,000 | 8.40 | **9.00** | 10.00 | 10.40 | 11.60 | 12.60 | 13.90 |
| Replace 1,000 | 8.50 | **9.00** | 9.90 | 10.20 | 11.30 | 12.90 | 13.80 |
| Partial update | 800µs | **700µs** | 1.60 | 4.50 | 1.10 | 2.30 | 1.30 |
| Select row | 0µs | **0µs** | 700µs | 0µs | 300µs | 400µs | 400µs |
| Swap rows | 800µs | **700µs** | 1.40 | 800µs | 7.10 | 2.40 | 1.10 |
| Remove row | 6.90 | **7.30** | 8.40 | 7.20 | 7.50 | 8.80 | 7.80 |
| Clear rows | 100µs | **200µs** | 400µs | 500µs | 1.00 | 400µs | 800µs |
| Create 10,000 | 89.80 | **95.00** | 110.50 | 115.50 | 226.20 | 237.70 | 288.20 |
| Append 1k→10k | 20.90 | **22.40** | 92.30 | 23.80 | 24.70 | 72.10 | 28.30 |

(ms unless noted. **SUPERSEDED — this table predates both Octane and the competitor fast-path corrections.** The 2026-08-14 medians immediately below are ALSO retracted (see their own heading) — the current authoritative measurements are the "CORRECTED field" table in the header paragraph above.)

### Authoritative medians — 2026-08-14, load 2.70–9.24, all competitors on their fast path — RETRACTED 2026-08-18

**This table is retracted; do not cite it.** It was measured with the Octane
`String(row.id)` handicap and the five-implementation retained-heap
stringification bug both still active — see the header paragraph for the
mechanism and the corrected numbers. Kept as a historical record only.

| Benchmark | Vanilla | **Pyreon** | Octane | Vue 3 | Solid | Svelte 5 | React 19 | Preact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Create 1,000 | 7.90 | **8.30** | 8.50 | 8.50 | 9.20 | 9.20 | 10.40 | 12.20 |
| Replace 1,000 | 7.80 | **8.30** | 8.40 | 8.50 | 9.10 | 9.30 | 10.50 | 12.20 |
| Partial update | 800µs | **800µs** | 900µs | 1.10 | 3.90 | 1.40 | 1.00 | 1.10 |
| Select row | 0µs | **0µs** | 100µs | 400µs | 0µs | 400µs | 300µs | 300µs |
| Swap rows | 800µs | **900µs** | 1.00 | 1.20 | 900µs | 1.50 | 6.60 | 1.10 |
| Remove row | 6.50 | **6.60** | 6.70 | 6.90 | 6.60 | 7.30 | 6.90 | 7.20 |
| Clear rows | 100µs | 200µs | **100µs** | 200µs | 400µs | 300µs | 700µs | 700µs |
| Create 10,000 | 81.90 | **87.00** | 89.70 | 92.30 | 104.70 | 103.20 | 212.20 | 274.20 |
| Append 1k→10k | 18.10 | **18.50** | 19.90 | 76.10 | 20.30 | 26.00 | 21.30 | 22.30 |

**The corrected replacement for this table is the "CORRECTED field" table in
the header paragraph above** (pending merge of #2893/#2894/#2895/#2896/#2897/#2899).
Cost vs hand-written **Vanilla** on the corrected field: ~7.4% at create-1k,
~7.8% at create-10k, and (fast-mode-only samples, see the append constraints
above — never a raw ratio against Vanilla's bimodal median) +3.8%/+4.9% at
append — the per-row signal allocation and keyed-`<For>` map, as documented.
**These create/create-10k wall-clock percentages are real MEASUREMENTS but
are layout-dominated, not clean JS-cost signals — see the "layout-bound"
methodological finding above; the only clean framework-attributable signal
on `create 1,000` is the JS-only term (~+28%, invisible in wall clock).**

Reproduce: `cd examples/benchmark && bun bench:fair --repeat 5`.

### The Preact retained gap is V8's number-string cache, not Pyreon memory (2026-08)

Pyreon reads ~0.03–0.04MB above Preact on retained heap, reproducibly. That delta is
**entirely V8's `smi_string_cache`** — an engine-internal Number→String cache held from
`(Strong root list) ← (GC roots)`, which V8 grows once enough distinct integers are
stringified **in JS** and never shrinks. It is not allocated by, owned by, or
proportional to the framework.

Attribution (`bun bench-heapdiff.ts`, real Chromium heap snapshots, 3 passes,
load 5.0–5.6 stamped; per-framework `usedJSHeapSize` varied by **0.1KB** across passes,
so the delta is ~400× the instrument's run-to-run noise and is genuinely resolvable —
the 16KB `STABLE_DELTA` in `bench-fair` is a convergence threshold, NOT the resolution):

| bucket | Pyreon | Preact | delta |
| --- | --- | --- | --- |
| `array/(anonymous)` — of which `smi_string_cache` | 113.1KB / **64.0KB** | 50.2KB / **1.0KB** | **+62.9KB** |
| `code` | 658.8KB | 680.2KB | **−21.4KB** |
| everything else (object, closure, string, native, shape) | — | — | ≈ +1KB |
| **snapshot total** | 3253.7KB | 3211.2KB | **+42.6KB** |

Causally verified, not inferred: changing only `<td>{String(row.id)}</td>` to
`<td>{row.id}</td>` in `impl/pyreon.tsx` drops the cache 64.0KB → 1.0KB, the snapshot
3253.7 → 3190.2KB, `usedJSHeapSize` 2539.1 → 2476.0KB, and flips the delta from
**+42.6KB to −19.9KB** — i.e. **Pyreon's actual retained memory is ~20KB BELOW Preact's,
consistent with its 21KB smaller code space.** (The residual after removing the cache is
the code advantage.)

**The principled fix — normalise ALL impls to the raw value — is now staged as open PR
[#2899](https://github.com/pyreon/pyreon/pull/2899), pending merge as of 2026-08-18.**
`String(row.id)` was also used by the Solid, Vue and Vanilla impls (Preact/React/Svelte
already passed the raw number), so the one-line Pyreon-only change described above was
correctly declined: shipping it alone would have handed Pyreon a 63KB advantage its
competitors still paid — the mirror image of the competitor handicaps retracted in the
2026-08 objectivity pass, and just as dishonest in our favour. #2899 normalises every
implementation to the raw value (also the more idiomatic form in every case) and is the
source of the corrected retained-heap table in the header paragraph above: Vanilla 2.38
· Preact 2.50 = **Pyreon 2.50** · Solid 2.53 · Octane 2.69 · Svelte 2.70 · Vue 2.71 ·
React 2.89 MB — a **tie with Preact for 3rd of 8**, not a 63KB lead. Once #2899 merges,
re-verify this table and remove the "pending" qualifier.

Until then: do NOT repeat "2nd among frameworks on retained memory" as a statement about
Pyreon's memory. The honest statement is that the field's retained column currently
measures, in part, which impls call `String()` in JS.

Trap worth generalising: **a heap metric can be dominated by an ENGINE-INTERNAL cache
that your own benchmark's code shape grows.** Bucket a snapshot by constructor and check
the GC-root-held entries before attributing a delta to the framework. Note also that node
cannot reproduce this contrast — node's own startup saturates `smi_string_cache` to
128KB, so both arms of a node A/B read identical; it only shows in a fresh browser page.

### Octane is now the nearest rival (added 2026-08, 8th framework)

[Octane](https://octanejs.dev) — Dominic Gannaway's compiled React framework, successor to Inferno — is in the suite as of PR #2635, and it is **by a clear margin the closest thing to Pyreon that has been measured here**. It displaces Solid as the nearest competitor on most ops.

Pooled head-to-head, `--repeat 3` (60 samples/op, same page-isolated + forced-GC + adaptive-warmup protocol):

| Benchmark | Vanilla | **Pyreon** | Octane |
| --- | --- | --- | --- |
| Create 1,000 | 10.50 | **10.30** | 10.90 |
| Replace 1,000 | 10.40 | **10.50** | 10.90 |
| Partial update | 1.00 | **900µs** | 1.00 |
| Select row | 0µs | **0µs** | 100µs |
| Swap rows | 1.00 | **1.00** | 1.10 |
| Remove row | 7.80 | **8.10** | 8.20 |
| Clear rows | 200µs | **300µs** | 100µs |
| Create 10,000 | 102.40 | **107.60** | 111.80 |
| Append 1k→10k | 25.40 | **27.20** | 29.40 |

**Verdict: Pyreon 4 outright (create-1k, replace, create-10k, append), 4 CI95-ties (partial update, swap, remove, clear), 1 unrankable (select — Pyreon under the timer floor, Octane at 100µs). Octane takes no op outright.** Retained heap after suite: Pyreon 2.48MB vs Octane 2.56MB. **RETRACTED, 2026-08-18 — this run predates the fix for Octane's own handicap and is not trustworthy as stated.** Octane's row id in this table was still rendered `{String(row.id)}`, which disabled its compiler `forBlock` fast path; "Octane takes no op outright" is exactly the kind of claim that bug would produce. The corrected field (header paragraph above, pending PR #2897) finds Octane DOES take an op outright (`clear rows`) and mostly ties Pyreon rather than losing to it on 4 ops. Kept here as a historical record of what the pre-fix harness reported, not as a current verdict.

**`clear rows`: the corrected diagnosis — the loss is real, reconfirmed, and unchanged in size; the EXPLANATION this file previously gave for it was wrong by more than an order of magnitude, and three separate investigations closed the question instead of re-measuring it.** Across the three 2026-08-04 full-field runs its median was 100µs vs Pyreon's 200µs (one timer quantum, ambiguous — see the "Honest limits" quantization caveat). #2894's finer-resolution timer resolved that ambiguity to a genuine, CI-disjoint **1.43× loss** (Octane 115µs vs Pyreon 165µs), and the FINAL post-#2903 board above confirms it at **~1.45×** (160µs vs 110µs) — table-layout has no bearing on this op, since clearing never widens a cell. What was wrong was the explanation attached to that number: "2 mandatory disposals per row — the app-owned label signal + the selector-driven class effect — the disposal chain is already at its floor," a diagnosis this file stated as INVESTIGATED AND ACCEPTED after two further levers were measured and declined: (a) epoch/lazy pruning, a bad trade because it adds a per-notify branch to the hot path; (b) batching the per-row removals into one end-of-batch sweep, which genuinely IS structurally idle on this op — a non-timing census of a real 1000-row teardown counts 0 `Set.delete` calls against 1000 `Map.delete` calls, so there is no shared-Set contention to batch. Both declined levers, and the "already at its floor" claim they were declined against, inherited a cost decomposition — "selector `.subscribe` disposers ~13µs + cleanup-closure dispatch ~11µs" — that nobody had independently re-measured.

A subtree-attributed CDP profile (real Chromium, 10µs sampling, 1000 rows × 400 iterations, PR [#2912](https://github.com/pyreon/pyreon/pull/2912), open) found why: those two numbers were the SAME work. V8 inlines `createSelector`'s disposer into its caller, so "cleanup-closure dispatch ~11µs" was the inlined selector work counted a second time, not an independent floor.

| component | µs/op | share |
| --- | --- | --- |
| `replaceChildren` (native DOM — Vanilla pays this too) | 49.6 | 63% |
| `<For>` effect body | 12.7 | 16% |
| `createSelector.subscribe` disposer | 11.1 | 14% |
| `handleFastClear` | 2.5 | 3% |
| **`_directFn` disposer — the per-row SIGNAL binding** | **0.9** | **1%** |
| row cleanup closure + misc | ~1.9 | 2% |

**Tearing down the fine-grained SIGNAL binding — the thing "the price of fine-grained subscriptions" was blaming — costs 0.9µs per 1000 rows, not the ~27µs this file previously attributed to that mechanism.** The real cost was `createSelector`'s separate per-key `boundSubs` registry, duplicating what the `<For>` reconciler's own key map already holds — a fixable data-structure duplication, not an architectural price. Three hypotheses died against the same profile: a V8 `Map.delete` shrink/rehash storm (refuted — flat ~25ns/key across every deletion fraction from 10% to 100%); Octane's `textContent = ''` being a cheaper bulk primitive than `replaceChildren` (refuted — 95µs vs 100µs, tied; the real 6× variable seen across runs is whether the rows were ever laid out, not the primitive); and "the disposal chain is already at its floor" itself, which it was not.

**The fix (PR #2912, still open, not yet merged): give `boundSubs` a holder each key's disposer closes over, so unsubscribing writes one field and touches no map, and drop the whole map in one `clear()` when the live count reaches zero.** Reclamation moved to insertion rather than dispose — a teardown counting a list down to zero walks THROUGH every reclaim threshold on the way, rebuilding the map two or three times before the last row proves the rebuilds pointless (measured 10.3µs of a 1000-row clear, most of the win). Three interleaved A/B cycles, real Chromium, per-cycle arms non-overlapping, Octane and Vanilla flat across both arms:

| | before | after |
| --- | --- | --- |
| `clear rows` median | 140µs | **125µs** |
| overhead vs Vanilla | 60µs | **35µs** |
| JS clear path (CDP) | 78.7µs | **60.7µs** |
| ratio to Octane | ~1.47× | **~1.15×** |

Cost: +32 B per LIVE subscribed key (148.8 → 180.8 B/key), fully reclaimed on teardown. No API change, no hot-path tax — the holder indirection is paid twice per selection CHANGE, not per key. **`clear rows` remains an outright loss to Octane once #2912 lands, and it will stay one: Octane's advantage here is architectural, not a missing optimisation.** Its own source registers zero subscriptions per row — text/class updates are prev-value diffs on a per-row bag, teardown is a single `disposed = true` flag, and selection is a reconciler fast path over the same key→block map Octane already maintains for reconciliation. Rows never register, so selection teardown is free for Octane — the same trade that loses Octane `partial update` to Pyreon's fine-grained bindings.

**The lesson this file is recording against itself: an "INVESTIGATED AND ACCEPTED" note in a performance record is load-bearing — it reads as permission to stop looking, and three separate investigations took it as exactly that.** Neither declined lever (epoch pruning, the batched sweep) was wrong given the decomposition on the table at the time; the decomposition itself was never independently re-profiled, because each entry that came before said the question was closed. The closure, not the arithmetic, was the obstacle. Prefer wording that invites re-measurement over wording that closes a question — this file no longer marks a gap "INVESTIGATED AND ACCEPTED" unless its cost attribution has actually been independently re-profiled, not merely re-cited.

Scope caveat SUPERSEDED REPEATEDLY (2026-08-04, then 2026-08-14, then retracted 2026-08-18 for the Octane handicap, then append re-adjudicated 2026-08-18, then the WHOLE field re-measured again 2026-08-18 after the table-layout root-cause fix): the full 8-framework field has had multiple same-day `--repeat 5`-class runs and two rounds of retraction. Every verdict quoted anywhere in this history predating the "FINAL corrected field" table in the header paragraph is superseded. **The current verdicts are in the header paragraph above**: 2 outright (create-10k, append — both WIDENED by the table-layout fix), a plausible tie-cluster (create-1k, replace, partial-update, remove, select — CI bounds for the final board not yet in hand, treat as pending re-verification), 1 loss (clear rows, ~1.45×, unaffected by the layout fix — a further, independent fix narrowing it to ~1.15× is pending in #2912, see below), and one retracted overclaim (`partial update` vs Solid: was ~4.9×, corrected to ~2.1×) — pending merge of #2893/#2894/#2895/#2897/#2899/#2901/#2903 (NOT #2896, which is unrelated to this suite). The 7-framework table further above predates Octane entirely and is kept only as a historical per-op medians record.

**Coverage is the bigger gap — NARROWED 2026-08-18, not closed.** What is actually measured cross-framework today: js-framework row-list ops (`bench-fair.ts`), bundle size (`bench-bundle.ts`), SSR throughput (`bench-ssr.ts`), hydration (`bench-hydration.ts` — 4 of 8 frameworks), and, new, **dbmon-style sustained wide updates** + **deep component-tree mount and context propagation** (`bench-scenarios.ts`, 7 frameworks). The previous version of this line listed *hydration* as uncovered, which was already stale — `bench-hydration.ts` shipped before it was written. Still **no** cross-framework coverage for: **streaming SSR, portals, effect-heavy lists, memoization walls, async waterfalls**; and against krausest's own metric set we publish ONE retained-heap figure where it reports five memory metrics (ready / run / update / replace / repeated-clear — the last is a leak detector), and none of its three startup metrics (script bootup, main-thread work, transfer size). Two scenarios were considered and DROPPED as un-fair rather than shipped rigged: async waterfalls (Svelte has no Suspense equivalent, and the measurement is dominated by artificial delays rather than CPU) and portals (Svelte has no built-in portal; low claim value). "Fastest" claims remain scoped to what is actually measured.

### Hydration (cross-framework, 2026-08-17 report) — RETRACTED 2026-08-18: not a tie, a narrow Vue LEAD on a quiet machine

`bench-hydration.ts` (1000-row SSR table → interactive; per-framework fixtures from each framework's OWN server renderer; adoption node-identity + row-count + real-click interactivity gates in-page per iteration; `--repeat 3`, pooled n=60). The 2026-08-17 report, kept here as a historical record — do not cite its verdict: after the prop-level plan-specialization + row-shape-signature PR (and its two harness-fairness fixes — React's hydrate now `flushSync`-committed instead of awaiting rAF→setTimeout inside the timed region, and the runner AWAITS async verify callbacks), cleanest quiet run (load 8.2 stamped, decaying) **Pyreon 6.70ms [6.60–6.80] 🥇-nominal, Vue 6.75ms [6.60–6.90] 🤝 CI-overlap tie**, React 8.15ms (1.22×), Preact 9.50ms (1.42×); a same-day loaded run posted Vue ahead by 0.20ms (1.03×). Same-protocol baseline-runtime control runs the same day: Vue ahead by 0.30ms (1.04–1.05×, non-overlapping CIs) twice, tie once — so the PR closed a real ~0.1–0.3ms gap into the noise floor, and the claim published from that data was a **tie-to-1.05× band, NOT a win** (between-run drift is ±0.1–0.15ms at these magnitudes; #2694's earlier 1.20× was that session's conditions — its React 1.44× control included the rAF harness artifact now removed).

**That "tie" is itself now retracted — the load-8.2 CI was wide enough to swallow a real gap, not to disprove one.** Re-measured 2026-08-18 on a quiet machine, load 2.2–2.5, `crossOriginIsolated` verified with a real 5.0µs `performance.now()` quantum, page-loaded bundle hash asserted equal to the on-disk build hash (rules out a stale artifact), n=60 pooled per run × 4 independent runs:

| | run 1 | run 2 | run 3 | run 4 |
| --- | ---: | ---: | ---: | ---: |
| Vue | 6.16 | 6.16 | 6.16 | 6.20 |
| **Pyreon** | 6.35 | 6.42 | 6.37 | 6.45 |

(ms medians. CI95 **disjoint in all four runs** — this is the opposite of the load-8.2 result's CI-overlap.)

**The honest verdict: Pyreon is BEHIND Vue on hydration, by roughly 3–4%, not level with it.** Say this plainly — do not restate it as a tie, a nominal win, or "essentially the same." The rest of the 2026-08-17 diagnosis is unaffected by this correction and still holds: the timed region is floor-dominated (~1.4ms/iter is Pyreon hydration JS — compiled-adoption spot-verify + bind + For-block parse — the rest is the forced layout of the 1000-row table + GC every framework pays, which compresses ratios; compare absolute gaps, not ratios, on this bench), and the residual Pyreon pays that Vue does not is per-row `$`-marker normalization + spot verify (~0.2–0.4ms/1000 rows), bought by the `k:`/`$` marker architecture that funds keyed adoption + strict verify-then-bind. Only the "tie" framing was wrong, not the mechanism. Solid/Svelte/Octane remain ABSENT (their hydration needs their real compiler toolchains wired in — follow-up).

**Standing instruction: this figure must not be restated as a tie without re-measuring on a quiet machine.** A load-8.2 run is not disqualifying on its own, but its CI95 must be checked for width before a tie is published from it — this exact number was reported as a tie once already and was wrong. Reproduce: `cd examples/benchmark && bun bench-hydration.ts --repeat 3` (quiet machine, load < 3, load-stamped; run at least twice and confirm CI95 disjointness before publishing any verdict on this op).

**A separate, non-magnitude finding: the committed hydration bench is structurally blind to template adoption.** Compiling `hydration-pyreon-compiled.tsx` (the bench's own Pyreon fixture) through the real `transformJSX` yields exactly ONE `_tpl` — the `<tr>` inside the `<For>` callback; the `<table>`/`<tbody>` wrapper never templatizes, because the emitter bails on component children and `<For>` *is* a component. Node retention measures **62/62 on both arms**, so the bench cannot see PR [#2918](https://github.com/pyreon/pyreon/pull/2918) (open — hydration adopts compiled templates instead of discarding them) at all: the one thing this op templatizes was already fully adopted before the fix. Two sub-findings:

- **Any `<For>`-driven keyed list is already adopted fully by this suite** — a keyed list is the wrong instrument for measuring template-adoption regressions or fixes; it reports identically whether the fix is present or not.
- **`.map()`-composed components still retain 0/241 nodes even after #2918, with a correct final DOM** — the adoption gap survives, for this idiom specifically; it silently discards and rebuilds. This is a live, OPEN residual gap in a very common idiom — record it as such, not as fixed by #2918.

**A new scenario reaches what this bench cannot see — PR [#2919](https://github.com/pyreon/pyreon/pull/2919), open, not merged: an app-page shape (320 statically-composed components, 2,206 nodes) where #2918's fix IS visible.** Measured on that shape: Pyreon **3.43/3.49ms → 3.19/3.13ms, ≈8.7% faster**, all four cross-arm CI95 comparisons disjoint, with Vue/React/Preact controls showing no arm-to-arm correlation (the improvement is specific to the Pyreon arm, not a shared machine-load artifact). Against Vue on this same shape the gap WIDENS, it does not close: **1.07–1.10× behind, before → 1.18–1.19× behind, after.**

State this pair with its limits, not as a settled destination. **#2918 is primarily a CORRECTNESS fix** — it stops SSR pages discarding typed input, focus, scroll position, and foreign (non-Pyreon-attached) listeners on hydration; the 8.7% is a shape-specific bonus, not the point of the PR. The scenario itself is author-judge, one page shape, on one machine; Solid/Svelte/Octane are absent because hydratable-mode compiler output cannot be hand-written faithfully for this shape (same caveat as the flagship suite's deep-tree scenario); 320 spelled-out components is the honest UPPER end of static composition — a page mixing in `.map()`-composed sections gets proportionally less benefit, and a page that is entirely `.map()`-composed gets none, per the open residual documented above. **Both #2918 and #2919 are OPEN as of this writing — the numbers in this paragraph describe the destination once they land, not `main`'s current state; check merge status before citing either.**

### Coverage-expansion scenarios — 2026-08-18 (CORRECTED run), `--repeat 3` (60 pooled samples/op), load 2.35 → 3.45 stamped

Two shapes the nine-op suite structurally cannot see, because every one of its ops runs on a single flat two-level keyed `<tr>` list. **Pyreon LOSES one of them outright**, and the loss survived a fairness correction that shrank it.

| Op | Vanilla | **Pyreon** | Solid | React 19 | Vue 3 | Svelte 5 | Preact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dbmon tick (100 rows × 6 cells, ALL changing) | 1.70 | 1.90 | 1.90 | **1.80** | 2.05 | 1.80 | 2.20 |
| mount deep tree (2,047 components) | 2.40 | **5.00** | **3.20** | 5.20 | 7.40 | 12.80 | 5.90 |
| context → 1,024 consumers | 1.50 | **1.60** | 1.70 | 2.30 | 2.30 | 2.40 | 2.60 |

(ms medians. Ranked against the best FRAMEWORK; Vanilla is the floor, not a competitor.)

- **dbmon — a tie band that does not discriminate, and Pyreon is NOT top of it.** React 1.80ms nominally leads; Svelte 1.80, Pyreon 1.90 and Solid 1.90 are all CI-overlap ties; the whole field spans 1.70→2.20ms (1.22× fastest-to-slowest framework). The nominal ordering INSIDE the band reshuffles between runs — an earlier same-day run had Pyreon nominally first and React third. That volatility IS the finding: when EVERY value changes every tick, a signal graph's advantage (skipping unchanged work) is removed by construction and everyone converges toward the DOM-write floor. **Never quote a dbmon result as a win for anyone.**
- **mount deep tree — Pyreon LOSES to Solid, 5.00ms vs 3.20ms (1.56×) in THIS table's run (pre-#2895 Pyreon code).** The only op in the suite where Pyreon is beaten outright, well outside CI. **The originally published figure was 1.88×, and ~26% of that gap was a SCENARIO ARTIFACT, not framework cost** — our Solid arm passed plain-object child props (`{ depth: props.depth - 1 }`), skipping a cost Solid's real compiler output pays. Verified, not assumed: compiling the equivalent source through the installed `babel-preset-solid@1.9.12` emits `_$createComponent(SolidNode, { get depth() { return props.depth - 1 } })`. With the faithful getter arm, Solid moves 2.70 → 3.20ms (**+18.5%**) and this table's honest gap is 1.56×. The getter-prop tax is a SHARED architectural cost, not a Pyreon-specific one — internal cross-check: that delta appears in MOUNT (where props objects are created) and vanishes in propagation (1.06×), exactly where it should. **This 1.56× is itself now retracted — PR #2895 landed after this table's Pyreon 5.00ms was captured; see "Deep-tree mount, re-measured post-#2895" immediately below for the current honest figure (1.36×) and a measured decomposition of what remains.**
- **context propagation — Pyreon leads, CI-tied with Solid.** 1.60ms vs Solid 1.70; React 1.44×, Vue 1.44×, Svelte 1.50×, Preact 1.62×. React/Preact are on their documented optimization (tree element built once, passed as reference-stable `children`, so the Provider re-renders but the interior 1,023 nodes bail out and only the 1,024 consumers re-render) — without it they would re-render all 2,047 and the gap would be an artefact rather than a measurement.

The tree scenario ships a labelled **`SolidJS (eager props)` diagnostic arm** (2.70ms) alongside the ranking `SolidJS` entry (3.20ms) so the getter-prop tax stays visible instead of being folded silently into a ratio. It is excluded from ranking by `NON_RANKING` in the driver — ranking against it would reintroduce exactly the handicap it exists to expose.

### Deep-tree mount, re-measured post-#2895 (2026-08-18) — 1.56× narrows to 1.36×, and the remaining gap now has a measured decomposition

PR [#2895](https://github.com/pyreon/pyreon/pull/2895) (`jsx()` zero-copy path + single-pass `makeReactiveProps`) moved Pyreon's OWN deep-tree baseline 4.90 → 4.50ms on its own before/after A/B — the table above still reports the pre-fix 5.00ms because it was captured before that PR's runtime change took effect in this scenario. Re-running the full three-way comparison on current main — not just Pyreon in isolation — gives the honest cross-framework figure, `--repeat`-pooled, n=80, load 5.11 → 4.95 (settling, not rising), `crossOriginIsolated` verified:

| | ms |
| --- | ---: |
| Vanilla (floor) | 2.31 |
| SolidJS | 3.26 |
| **Pyreon** | **4.44** |

**Pyreon is 1.36× slower than Solid on this op, down from 1.56× — still an outright loss, only the magnitude changed.** This correction runs in Pyreon's favor, unlike the five artifacts in the revision history above that all ran the other way; it is published with the same rigor anyway (see revision-history item 6).

The remaining 1.18ms gap (Pyreon 4.44ms vs Solid 3.26ms) has a measured decomposition:

- **0.50ms (42%) is removable.** Solid's compiler templatizes an element that has component children (`_$template(...)` + `_$insert(...)`); Pyreon's compiler currently bails the WHOLE template the moment any child is a component. Hand-written candidate arms measured **−11.3%** for the append-child form (3.94ms, reproduced 3.95/3.94/3.95ms across three runs) versus only −4.5% for a placeholder-comment form. **This is a MEASURED BOUND from hand-written arms, not a shipped result** — an implementation PR is in flight; do not cite 3.94ms as Pyreon's current number until it ships.
- **Getter-shaped reactive props are a SHARED cost, not a Pyreon-specific disadvantage.** Solid pays 0.66ms for them (its eager-props diagnostic arm reads 2.62ms vs its real getter-props arm's 3.26ms) and Pyreon pays ~0.80ms — both ≈ +20%. Making Pyreon's props eager to "catch up" would just reproduce the exact handicap this suite already flagged as unfair when it was Solid's (see the `mount deep tree` bullet above).
- **~0.38ms appears to be the genuine irreducible price** of owner-based context + per-component disposal + fine-grained props — what's left after removing both the 0.50ms templatization win above and a ~0.30ms lazy-`EffectScope`-allocation option that was investigated and CLOSED (deferring scope allocation past setup reopened a leak-class risk, so it was not pursued).

A fresh CPU profile of the mount path (post-#2895) supports this decomposition but should be read as an ORDERING, not an absolute-cost breakdown — the harness itself dilutes it. Self time: GC 14.4% (Solid 16.2%), `insertBefore` 2.4%, `removeChild` 1.9%, `makeReactiveProps` 1.6%, `jsx` 1.5%, all diluted by the harness's own `getBoundingClientRect` calls (18.7%) and idle time. Any framing of a single fixed percentage for "the props pipeline" predates this profile and should not be repeated as a current figure — post-#2895, `makeReactiveProps` + `jsx` together are ≈3.1% of self time, a small slice of a GC- and harness-dominated trace, not a standalone ~29% cost.

Reproduce: `cd examples/benchmark && bun bench:scenarios --repeat 3`. Per-iteration gates run IN-PAGE (dbmon reads back cell text AND threshold class on three rows; the tree checks all 1,024 leaves, not a sample) so a framework that silently no-ops fails the run instead of posting a fast number.

**Standing lesson (this is the third handicap of its kind — see also `shallowRef`/`$state.raw` in PR #2878): when a rival is hand-written at "compiler output level", COMPILE THE SNIPPET through its real toolchain and diff the emit. Do not reason about what the compiler probably does.**

**ONE honest Pyreon entry** = the idiomatic JSX users ship (`pyreon.tsx`). There is no manufactured "compiled" tier — the compiler already lowers idiomatic JSX to the same `_tpl()` cloneNode + fine-grained-binding output a hand-written `_tpl()` would (PR #1501 removed a per-row `_bind()` inefficiency for static `<For>`-item reads, making them byte-identical). Earlier "4–8× on small ops" claims were a harness artifact (an `rAF` commit wait inside the timed region + missing per-run resets), fixed by tightest-commit timing (`flushSync`/microtask/synchronous per framework) + per-run reset hooks.

**Methodology** (designed for objectivity): per-framework page isolation (`page.goto('?framework=X')`); forced GC between iterations (`--expose-gc`); adaptive warmup; 20 timed runs + median + 95% bootstrap CI + CV + CI95-overlap `🤝` tied-marker; real Chromium on production `vite build`; DOM verification per iteration; seeded RNG; real published deps; tightest-commit-per-framework (no `rAF`); per-run resets on every op; randomized + per-pass-reshuffled execution order; machine stamp printed; retained-heap metric (`--enable-precise-memory-info`, post-GC). **Honest limits**: **(0) EVERY sub-millisecond row in this suite is QUANTIZED, and one verdict rests entirely on that.** Chromium clamps `performance.now()` to **100µs** (a Spectre mitigation), so a sample can only ever be a multiple of 100µs — `--repeat` pools more samples and tightens the CI95, but it cannot subdivide a clock tick. `clear rows` — the single op Pyreon is reported behind on — has a total on-CPU cost of ~79µs (subtree-attributed CDP profile, PR #2912 — supersedes an earlier ~100-130µs estimate from #2880's coarser, non-subtree-attributed profiling), so "Octane 100µs vs Pyreon 200µs" is **ONE tick versus TWO**, not a measured 2× difference. The tell is in the run's own output: both frameworks report a CI95 collapsed to a single point with a huge CV (2026-08-17: Pyreon `200µs [200-200] cv38%`, Octane `100µs [100-100] cv53%`) — a CV that large beside a zero-width CI is the signature of samples bouncing between adjacent quanta, not of a stable measurement. Treat every `select row` figure and the `clear rows` ratio measured with the PLAIN `performance.now()` timer as UNRESOLVED by this instrument. **UPDATE 2026-08-18 (pending #2894, not yet merged): this limitation has a fix.** #2894 subdivides the 100µs clamp by timing K×(op) and dividing, giving a genuine ~5.0µs quantum — at that resolution `clear rows` resolves to a real, CI-disjoint ~1.45× loss (160µs vs 110µs on the FINAL post-#2903 board; a further, independent fix pending in #2912 narrows this to ~1.15× without closing it — see "the corrected diagnosis" above) rather than "one tick vs two," and `select row` resolves to a small (~1.3–1.7×) but still imprecise gap, not the CDP-profiling escape hatch this paragraph used to require. Until #2894 merges, a `clear rows` or `select row` ratio measured by the DEFAULT `bench:fair` timer is still unresolved by this instrument — do NOT publish one without either #2894 or CDP CPU profiling. **(1)** this is CPU-objective, not real-world-async-latency (React's default path would be higher); the deepest limit is **author-judge** (the framework author writes + judges the bench) — only an upstream submission to the independent krausest/js-framework-benchmark fully resolves it (a ready-to-submit `frameworks/keyed/pyreon` implementation is staged at `contrib/krausest/pyreon-keyed/` — built + 8-op-smoked against PUBLISHED npm packages; submission steps in its README-SUBMISSION.md — the upstream PR itself is a human decision). A **real-app head-to-head does not exist yet** (the `cpa-pw-app-*` ports run on Pyreon compat shims, not the real frameworks) — "fastest" claims stop at this synthetic suite's evidence.

## Deeper detail — read on demand

| Topic | File | Size |
| --- | --- | --- |
| Core micro-benchmarks: router, reactivity, head, store, state-tree, machine, i18n, permissions, form, query head-to-heads | `references/core-micro-benchmarks.md` | ~4831 tok |

Read with the Read tool:
`.claude/skills/pyreon-benchmarks/references/core-micro-benchmarks.md`
