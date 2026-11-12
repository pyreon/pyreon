---
title: "We caught our own benchmarks lying. Here’s every bug, and the wins that survived"
description: "Eight measurement bugs in our own benchmark, from a String() call that switched off a rival’s compiler to statistics that counted 5 page loads as 100 samples. What each one cost, the guard that stops it now, and the results still standing."
date: 2026-11-23
slug: we-keep-retracting-our-benchmark-wins
tags: [javascript, performance, benchmarking, webdev]
cover: /blog/covers/we-keep-retracting-our-benchmark-wins.png
---

Most benchmark pages show you the wins. Ours opens with the mistakes.

Section 0 of [`BENCHMARKS.md`](https://github.com/pyreon/pyreon/blob/main/BENCHMARKS.md) lists every verdict that moved and every claim we withdrew, above the results, not in a footnote. We hunted bugs in our own harness for months, and most of them made Pyreon look *better* than it was. We fixed every one, re-ran everything and published what came out.

Here is what survived:

::: bench
- **130 µs** to clear rows, an outright win in both runs against ten frameworks (Vue 3.6 Vapor RC: 145 µs)
- **2.6×** faster than React 19 building 10,000 rows
- **3.8×** faster than Preact building 10,000 rows
:::

It also ties for the lightest retained heap on the board. Those numbers came through every bug below, and that is why they mean something.

*Synthetic, author-run, Apple M3 Max, real Chromium. Reproduce: [pyreon.dev/docs/benchmarks](/docs/benchmarks).*

We publish where we lose, so you can trust where we win. Here are all eight measurement bugs we found in our own benchmark, what each one cost us, and the guard that stops it from coming back. Don't trust us. Run it.

## Start by distrusting us

Pyreon's authors wrote every harness in the suite, wrote every competitor's implementation and decide what counts as a win. The record says so at the top: *author-judged, synthetic*. In a benchmark like that, every judgement call leans toward the home team, whether anyone means it to or not.

There are two answers to that. The first is an independent venue: a keyed Pyreon implementation for krausest/js-framework-benchmark is staged in the repo under `contrib/krausest/pyreon-keyed/`. Staged, not yet submitted. The second answer is this post: publish the method, publish every retraction, and make our work cheap to check.

## 1. Competitors were running on their slow paths

The first audit, in August 2026, found three handicaps in the row-list suite. All three favoured us (#2878):

- **Svelte** ran on a deep `$state` proxy, and its arm also mapped 10,000 objects into a new array inside the timed region, for a type-level formality.
- **Vue** ran on a deep `ref`, which puts a Proxy on every row. Vue's own performance guide says not to do that for a list you replace wholesale.
- **Octane**, our closest rival, was pinned eight patch releases behind its latest version while every other dependency floated.

We fixed them, re-ran, and republished every claim (#2864). The Svelte create-10,000 multiplier we had been quoting fell from about 2.5× to 1.19×. The PR says it plainly: "That was our benchmark's fault, not Svelte's."

**The guard:** every arm runs on its framework's documented fast path. Vue uses compiled templates (hand-written `h()` disables patch flags), Solid arms match `babel-preset-solid`'s output, React and Preact go through the automatic `jsx()` runtime. When an arm is written at compiler-output level, we compile the snippet through the real toolchain and diff the emit. Our internal benchmark guide puts it in one line: "Do not reason about what the compiler probably does."

## 2. We were timing clock ticks, not work

`clear rows` was published as "Octane 100 µs vs Pyreon 200 µs, 2.00× behind". On a page that is not cross-origin isolated, Chromium clamps `performance.now()` to 100 µs (a Spectre mitigation). Clear rows costs roughly 100 to 145 µs. So the suite was reporting which side of a tick each sample landed on. The real ratio at the time was 1.19–1.45× (#2894).

The tell had been in the output all along: a zero-width confidence interval next to a large coefficient of variation, `CI95 [200, 200] µs` with a CV of 0.38. A bootstrap over quantized samples reports perfect certainty because it cannot see the spread the clock threw away.

**The guard:** the benchmark pages send COOP/COEP headers, which shrinks the clock quantum to 5 µs. The harness measures the quantum inside the served page and aborts if isolation or the quantum is not what the report claims. That check has already fired once, on a stale `vite preview` that was holding the port and serving un-isolated pages. For ops below about ten quanta, a batch instrument times many repetitions inside one window, the same idea krausest uses for its multi-iteration variants. A follow-up (#2987) caught the harness still gating ratios on a hard-coded 0.1 ms floor that contradicted its own measured quantum, and replaced it with the measured value.

## 3. A `String()` call switched off a rival's compiler

Octane's `select row` lost to Pyreon by about 110×. A margin that size usually means you are timing the other framework's slow path, so the audit started from the assumption that we had got it wrong (#2897).

We partly had. The Octane arm rendered `{String(row.id)}`; the React arm it was ported from passes `row.id` raw. Octane's compiler marks a `@for` body as dependency-pure only when it contains no render-time call, and `String()` is a render-time call. Compiling the arm with `octane/compiler` and reading the emit showed the `forBlock` flags drop from 30 to 26. That cleared the `depEligible` bit and sent every surviving row through the heavier `renderBlock` path:

```js
// {String(row.id)}   flags=26  ->  renderBlock() per surviving row
// {row.id}           flags=30  ->  direct item-body call
_$forBlock(__s, 1, _b.a, _v, _key$0, __item$1, 30, [selectedId], null, _b.b, true)
```

It taxed four operations, not one. With the wrapper gone, Octane got faster on select, swap, partial update and replace, and the rendered DOM was byte-identical before and after.

**The guard:** an arm does no presentation work that a real user of that framework would not write, and competitor arms are checked by compiling them, never by reading their source.

## 4. A V8 cache was billed to the wrong framework

The same week, the retained-heap column moved for five of eight implementations at once (#2899). Five arms (Pyreon, Solid, Vanilla, Vue, Octane) called `String(row.id)`. Three (React, Preact, Svelte) passed the number.

Converting many distinct integers to strings in JavaScript grows V8's `smi_string_cache`. That cache is held from the GC roots and never shrinks, and our heap metric reads `performance.memory.usedJSHeapSize`. So about 62 KB of engine cache was being charged to whichever arms stringified their ids. Assigning the number to `node.data` lets the DOM binding convert it outside JavaScript, for free.

The fix (every arm renders the raw `row.id`) changed four competitor arms and made Vanilla, the baseline Pyreon is judged against, lighter. One cell moved against us.

**The guard:** the no-presentation-work rule, plus a heap-diff tool (`bench-heapdiff.ts`) that buckets heap snapshots by constructor and checks GC-root-held entries before anyone attributes a heap delta to a framework.

## 5. A CSS default inflated our lead about 2.3×

`append 1,000 rows to 10,000` was bimodal for seven of eight frameworks: one cluster of samples near 18 ms, another near 50 ms, and the reported median depended on which cluster won a given run (#2903). Vanilla was hit hardest, which made hand-written DOM look 2.5× slower than the frameworks. That absurdity is what gave it away.

Splitting each sample into framework work and layout showed the framework part steady at 1.2–1.6 ms and the layout flush at either 17.5 ms or 50 ms. The cause was `table-layout: auto`, the CSS default. Column widths come from the widest cell in the whole table, so an op that introduces a wider cell forces Chromium to re-measure all 11,000 rows. Whether that happens depends on random label content and on what the table has already seen.

The same mechanism had inflated one of our headlines. We had published a `partial update` lead over Solid of about 4.9×. With layout held constant it was about 2.1×, so the CSS mode had inflated our lead roughly 2.3×. We withdrew the 4.9×. On today's record, partial update is a statistical tie with the fastest rivals.

**The guard:** the fixture uses `table-layout: fixed` for every arm. That is less like a real app, on purpose: the cost it removes is identical work for every framework, triggered by random data. A bimodality guard (#2901) also refuses to publish a median that sits in an artifact mode. It computes `median / fastModeCentre`. In the measured data that ratio landed either at 1.00–1.03 or at 2.66–2.81, with nothing in between, so its 1.25 threshold is not a sensitive knob.

## 6. A "tie" was a busy machine

We had published hydration as a statistical tie with Vue. The run behind it was taken at a one-minute load average of 8.2. A re-run on a quiet machine (load 2.2–2.5, isolation verified, the served bundle hash checked against the file on disk) gave disjoint intervals in all four runs and a 3–4% Vue lead (#2920). The wide interval had been hiding a real gap, not proving there was none.

That PR also kept a tally of the August campaign: of its first six corrections, five had moved a Pyreon-friendly figure the wrong way for us.

**The guard:** every suite runs strictly one at a time, waits for a one-minute load below 4, and stamps the load before and after. A close verdict is published only after two runs agree.

## 7. A lead we had not earned

In September, `clear rows` was recorded as Pyreon's only outright loss on the board, about 1.45× behind Octane, and the record called it architectural: "it will stay one". Then a re-measure showed Pyreon about 3.1× ahead (#3301).

We split the swing before banking it. About 1.5× was Pyreon getting faster, from three merged optimisations. About 3× was Octane getting slower on that op: version 0.2.2 had replaced its keyed-list block with a new path. And that Octane upgrade had arrived through our own dependency sweep (#3174), so we reported the bigger half as what it was: a change in a competitor, not a win for us.

**The guard:** attribute a change to Pyreon only after splitting "Pyreon moved" from "competitor moved". And never call a gap architectural or permanent. Their code changes, and so does ours.

## 8. One hundred samples that were really five

This is the November one. The row board takes 20 samples per page load and 5 page loads per framework, and it bootstrapped those 100 samples as if each were independent. They are not. Samples from one page load share its JIT state and its heap, and page-to-page variation is large: per-page `swap rows` medians ranged from 620 to 860 µs for every arm, Vanilla included.

The fix (#4129) is a two-stage cluster bootstrap: resample page loads with replacement, then samples within each page. Re-deriving the 5 November verdicts with it moved three cells:

| op | pooled interval said | cluster interval says |
| --- | --- | --- |
| swap rows | Pyreon 1.07× behind Vue Vapor RC in run 1 | tie, both runs |
| create 10,000 | Pyreon win, both runs | tie in run 1, 1.02× win in run 2 |
| append 1k → 10k | Pyreon win, both runs | tie in run 1, 1.02× win in run 2 |

A split is not a win, so we no longer claim the last two.

The same PR fixed a defect pointing the other way. The scenario harness ranked every arm against the leader, and when the leader was another Pyreon variant, that variant's wide interval turned a real loss into a printed tie. Our default chart input is 1.16–1.20× slower than Chart.js at 1,000,000 points. The harness had been hiding that loss. The record now states it.

**The guard:** the board's intervals are cluster-bootstrapped, a run with fewer than three page loads prints "verdicts provisional", and each Pyreon arm is judged only against the best non-Pyreon arm. The scenario harness computes cluster intervals now too, but its published figures predate the fix, so the record marks its close scenario verdicts as provisional until the next run.

> **Every bug on this list became a pull request and a re-run. Don’t trust us. Run it.**

## Count the directions

Read the list again and notice which way the errors pointed. Handicapped competitors, a stringified id, a CSS default, a clamped clock, a busy machine, pooled intervals: almost every one made Pyreon look better than it was.

That is what author bias looks like in practice. Nobody wrote "make Octane slow". Someone wrote `String(row.id)` because it looked tidy, and nobody checked what Octane's compiler did with it.

So we audit a pleasant number with the same rigour as an unpleasant one. A 110× margin, "2.5× faster than hand-written DOM", a zero-width interval: we now treat each of those as a harness bug until proven otherwise.

> **Nobody wrote “make Octane slow”. Someone wrote String(row.id) because it looked tidy.**

## What a verdict has to survive now

- **A correctness gate runs before timing.** Every implementation must produce the same observable DOM, read back from the table, on every iteration.
- **One idiomatic Pyreon entry:** the JSX you would ship. No hand-tuned "compiled" tier.
- **Production builds, published competitor versions, seeded data,** and a framework order reshuffled every pass.
- **Cross-origin isolated pages** with a measured 5 µs clock.
- **Strictly sequential runs,** gated on a load below 4.
- **A win needs disjoint 95% intervals in both runs.** Anything measured once says "one run".
- **A tie has no ordinal.** "Tied with Preact", never "second".
- **Section 0 lists every verdict that moved** and every claim withdrawn.

## The board that survived all of it

The row-list suite: 10 frameworks, real Chromium, two runs on 5 November 2026, Apple M3 Max. Pyreon against the fastest rival on each op:

| op | Pyreon (run 1) | fastest rival (run 1) | verdict |
| --- | ---: | ---: | --- |
| create 1,000 rows | 7.26 ms | Vue 3 7.33 / Vapor RC 7.35 | tie, both runs |
| replace all | 7.13 ms | Vapor RC 7.11 | tie, both runs |
| partial update | 705 µs | Vapor RC 710 | tie, both runs |
| swap rows | 805 µs | Vapor RC 755 | tie, both runs |
| remove row | 5.70 ms | Octane 5.74 | tie, both runs |
| **clear rows** | **130 µs** | Vapor RC 145 | **win, 1.11–1.12×, both runs** |
| create 10,000 | 72.64 ms | Vue 3 73.99 | tie in run 1, 1.02× in run 2: not claimed |
| append 1k → 10k | 13.06 ms | Octane 13.25 | tie in run 1, 1.02× in run 2: not claimed |
| select row | 10 µs | below clock resolution | batch instrument: 1.86–2.04× ahead of Octane (one run) |

*Synthetic, author-run, Apple M3 Max, real Chromium. Reproduce: [pyreon.dev/docs/benchmarks](/docs/benchmarks).*

Clear rows is the one outright win on that board. On the rest, Pyreon, Vue 3.6 Vapor (a release candidate), Octane and on some ops Vue 3 are indistinguishable at this resolution, and we say so.

Step outside the leading pack and the gaps open up. Creating 10,000 rows takes Pyreon 72.6 ms against React 19's 192.0 ms (about 2.6×) and Preact's 278.0 ms (about 3.8×). Retained heap after the suite: Pyreon 3.08 MB and Preact 3.09 MB, tied as the lightest frameworks.

## Where we lose, from the same record

These are not footnotes:

- **Deep component-tree mount:** Solid is 1.15–1.18× faster (2,047 components, both runs).
- **Bundle size**, the same keyed-table app, gzipped: Pyreon 17.2 KB, Solid 7.5 KB, Preact 10.1 KB, Svelte 16.1 KB (Vue 27.4, React 69.6).
- **Signal creation:** about 5× slower than Preact Signals, on V8 and on JavaScriptCore.
- **Hydrating a 1,000-row keyed table:** tied with Vue on the framework walk; on the total, tied in one run and Vue 1.01× ahead in the other.
- **Router matching at 10 routes:** Hono is 1.91× faster (one run).
- Smaller ones: effect-list dispose (Solid, by one clock quantum), swap at 100 and 1,000 rows on the batch instrument (Octane 1.12× and 1.10×, one run, and the result moves with batch size), chart line mounts at 10,000 and 1,000,000 points with row-object input, and store setup against Zustand.

*Synthetic, author-run, Apple M3 Max. Reproduce: [pyreon.dev/docs/benchmarks](/docs/benchmarks).*

One more correction is already queued. A harness fix merged after the record (#4142) makes Hono's router arm build its params object inside the timed call, as every other arm already did, and stops the store bench building Pyreon's store id inside the timed loop. Both figures above come from the run before it. The benchmark record is the source of truth; if it differs from this post, the record wins.

## What is still open

- **No independent run exists yet.** The krausest implementation is staged, not submitted. Until someone outside the project runs these, every number here is ours.
- **The scenario suite's published intervals are still pooled.** Its close verdicts (context propagation, effect-list update and dispose, table mount, the 10k chart mounts) stay provisional until the re-run.
- **Three harness defects are open.** The batch instrument's swap result fails its own check that per-op cost must not depend on batch size. Two summaries (router average, `rx`) print no interval, so they yield no verdict. And the TodoMVC `add-100` ratio has read 1.14×, 1.38–1.51× and 1.99× on different days for reasons we have not found, so we quote the range.
- **Not measured at all:** Firefox, Safari, streaming SSR, startup metrics, and anything resembling your application. These are synthetic workloads. A full-stack suite (`@pyreon/zero` against eight meta-frameworks) now exists in the repo, and no result from it is published yet.
- **There will be more retractions.**

Find a harness bug and it gets the same treatment as every entry above: a PR, a re-run, and a line in section 0. The main board is one command:

```sh
cd examples/benchmark && bun bench-fair.ts --repeat 5 --wait-quiet 4
```

## Check our work, then build something

The full record, with every withdrawn claim, both runs, the competitor versions and every reproduce command, is at [pyreon.dev/docs/benchmarks](/docs/benchmarks). Run it. Tell us what you find.

Then see what the surviving numbers feel like in an app of your own:

```bash
npm create @pyreon/zero@latest
```

- Docs: [pyreon.dev/docs](/docs). Why a component runs once: [the first post in this series](/blog/components-run-once).
- Star the repo: [github.com/pyreon/pyreon](https://github.com/pyreon/pyreon)
- Questions, ideas, a bug: open an issue on [GitHub](https://github.com/pyreon/pyreon/issues), where every answer stays findable for the next person.
