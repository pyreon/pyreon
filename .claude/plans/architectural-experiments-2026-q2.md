# Pyreon Architectural Experiments — 2026 Q2

## Goal

Run bounded experiments to test which architectural / algorithmic bets actually produce measurable wins, and which look good on paper but don't survive contact with reality. Output: data, not opinions. Each experiment answers ONE yes/no question.

**Plan-level success**: in 8-10 weeks, we have empirical evidence for ≥1 architectural pivot worth committing to — OR proof that the current architecture is at the local optimum and effort should pivot to ecosystem (more components, better docs, killer apps). Both outcomes are wins; failure looks like ambiguous results that produce more meetings.

**Why now**: the fair-benchmark work in PR #324's session showed Pyreon is in the top cluster with Solid and Vue 3, not uniquely fastest. The CLAUDE.md "fastest framework on all benchmarks" claim is overstated. To genuinely differentiate, Pyreon needs either (a) proven architectural advantages or (b) honest repositioning. This plan produces the data to choose.

## Scope notes

- This plan is about **experimenting**, not shipping. Production rollout of any pivot is a separate plan after experiments graduate.
- Experiments are **throwaway by default** — they answer the question and the code may be discarded. The deliverable is `RESULTS.md`, not running code.
- Avoid sunk-cost fallacy: a 4-week experiment that returns "no" is a successful experiment. The postmortem is the artifact.
- Every experiment has GRADUATE / KILL / DEFER thresholds **written before it starts**. No moving goalposts.

## Phase 0 — Infrastructure (Week 0)

Cost: 2-3 days. Without this, every experiment reinvents measurement and results aren't comparable. **Do not skip.**

- **0.1** `examples/experiments/<name>/` directory convention. Each is a self-contained app + `RESULTS.md`. Template:
  ```markdown
  # E<n>: <Title>
  ## Question
  ## Method
  ## Baseline (sha + measurements)
  ## Experiment results
  ## Decision (GRADUATE / KILL / DEFER) + notes
  ```
- **0.2** Cleanup + commit `examples/benchmark/bench-fair.ts` from the PR #324 session — real-Chromium, DOM-verified, median + p90 + outlier trim. Add `--baseline <sha>` flag to compare any experiment to a baseline commit. Currently exists as untracked WIP in the PR #324 worktree.
- **0.3** `examples/perf-dashboard` already auto-installs `@pyreon/perf-harness`. Add three canonical journeys to `examples/perf-dashboard/src/journeys.ts` if not already there:
  - **chat**: append-heavy list, 1000 messages, scroll
  - **dashboard**: mostly-static layout, 50 reactive widgets, 5s of churn
  - **form**: 30-field form with cross-field validation, 60 keystrokes
- **0.4** Standard JSON result shape (`results/<experiment>/<sha>.json`):
  ```json
  {
    "experiment": "E1-speculative-mountfor",
    "sha": "...",
    "baseline_sha": "...",
    "wall_clock": { "create_1k": { "median": 9.2, "p90": 11.1 }, ... },
    "counters": { "runtime.mount": 1023, "mountFor.lisOps": 0, ... },
    "heap": { "after_test": 18.3 },
    "subjective": { "feels_instant": 4 },
    "decision": "GRADUATE | KILL | DEFER",
    "decision_notes": "..."
  }
  ```
- **0.5** Extend `bun run perf:diff` (already exists in `@pyreon/perf-harness`) to read the new shape. CI workflow `.github/workflows/perf.yml` already supports posting deltas to a PR — wire experiment results into that surface so each experiment branch automatically posts its delta.
- **0.6** Run baseline measurement against `origin/main` before any experiment starts. Pin the baseline SHA in every experiment's `RESULTS.md`. Re-baseline only if main moves >5% on any tracked metric.
- **0.7** Experiment-tracking issue per E1-E11 in the GitHub repo (template: question + criteria + decision). Branch names pre-allocated as `chore/experiment-e<n>-<slug>` — the repo's `.claude/scripts/guard-branch-name.sh` blocks anything not in `feat|fix|docs|release|chore|refactor|test|perf`, and `chore/` is the right semantic prefix for experiment scaffolding. Discussed but **not opened in this plan PR** — opened separately when experiments are scheduled.

## Phase 1 — Cheap parallel experiments (Weeks 1-2)

Five experiments, ~1 week each, run in parallel worktrees. Cheap enough to kill without grief.

### E1: Speculative monomorphic `mountFor`

- **Q**: Does an append-only fast path with deopt-to-LIS save ≥15% on append-heavy lists with ≤2% regression on shuffle-heavy?
- **M**: Add shape detector to `mountFor` (track last 5 mutation shapes). If all "append-only", use specialized path that skips LIS. On shape violation, drop to current path and don't re-specialize for this list. Run benchmark + chat journey.
- **GRADUATE**: ≥15% wall-clock win on append journey AND ≤2% loss on shuffle.
- **KILL**: <5% append win OR ≥5% shuffle regression OR any correctness bug.
- **C**: 1 week.
- **Inspiration**: V8 inline caches (speculative + deopt).

### E2: Static rocketstyle dimension resolution

- **Q**: How many rocketstyle component instances in real apps have all-literal dimension props, and what's the win when those resolve at build time?
- **M**: Compiler pass that tracks `<Button state="primary" size="large" />` literal-prop call sites, runs the rocketstyle dimension merge at build time, hoists the result as `__rs_resolved`. Run on `examples/ui-showcase` and `examples/perf-dashboard`.
- **GRADUATE**: ≥40% of rocketstyle call sites are statically resolvable AND mount throughput on those sites improves ≥20%.
- **KILL**: <20% statically resolvable OR ≤10% throughput win on the resolved sites.
- **C**: 1 week.
- **Pyreon-unique**: nobody else can do this — requires Pyreon's typed multi-dimensional theme system.

### E3: Local-first todo (architectural pivot test)

- **Q**: Does a local-first data layer feel instant under simulated network load?
- **M**: Build `examples/experiments/local-first/` — a todo app where the data store is `@automerge/automerge` (or `yjs`) wrapped in Pyreon signals. Add network latency toggle (0 / 200 / 2000 / 10000 ms). Have ≥3 testers use it at each latency level, score "feels instant" 1-5.
- **GRADUATE**: feels-instant score ≥4/5 at 2000ms latency AND ≥3/5 at 10000ms.
- **KILL**: <3/5 at 200ms (i.e. it doesn't even win at low latency).
- **C**: 1 week.
- **Inspiration**: Linear, Replicache, Triplit. The architectural pivot from "fetch-and-render" to "query-local-replica."

### E4: Bidirectional rendering — terminal target

- **Q**: Where does the rocketstyle abstraction leak when targeting non-DOM?
- **M**: Pick `Card` from `@pyreon/ui-components`. Add a `terminal` render target alongside DOM (Ink-style ANSI). Document every concept that has no terminal analog (hover, z-index, focus ring, gradients, etc.) in `RESULTS.md`.
- **GRADUATE**: ≥80% of `ui-components` concepts have a sensible terminal analog OR fail-safe degradation, AND the per-target code is ≤30% of the DOM-target code.
- **KILL**: terminal target requires ≥50% reimplementation of every component (proves the abstraction is DOM-shaped, not polymorphic).
- **C**: 3-4 days.
- **Leverage**: `@pyreon/document` already does this for PDF/DOCX/etc. — extend the philosophy.

### E5: Actor-model bug repro

- **Q**: Does message-passing actually prevent reactivity bugs, or just relocate them?
- **M**: Pick 2 known-buggy patterns (a parent + 3 children racing on shared state; a stale-closure-in-handler bug). Reimplement each as actors with private state + message queues. Try to reproduce the original bug in the actor version.
- **GRADUATE**: bugs are structurally impossible (not just unreached) AND the actor version is ≤2x the LOC of the signal version.
- **KILL**: bugs reproducible in actor version OR LOC blows up >3x.
- **C**: 3-4 days.
- **Inspiration**: Erlang/OTP, Elixir GenServer.

### Phase 1 checkpoint (end of Week 2)

Score each experiment GRADUATE / KILL / DEFER. Write a 1-page summary per experiment in `RESULTS.md`. Decide which graduate to deeper investment.

## Phase 2 — Medium experiments (Weeks 3-5)

Run 2-4 of these, prioritized by Phase 1 results. Each is 2-3 weeks. **Do not run all four** — pick based on Phase 1 signals.

### E6: Effect system in the type layer

- **Q**: Can typed-effects be added to `ComponentFn` without making DX miserable?
- **M**: Add `Effects` type parameter. Manually annotate 20 representative components from `@pyreon/ui-components` + 5 from `@pyreon/document`. Write a TypeScript transformer that flags effect-mismatches at component call sites.
- **METRIC**: % of components requiring zero manual annotation (compiler infers); average annotation lines per non-pure component; type-error message readability (5-tester score).
- **GRADUATE**: ≥80% inferable; ≤3 lines annotation for the rest; type errors actionable (≥4/5 readability).
- **KILL**: <50% inferable OR error messages unintelligible OR ergonomics universally rejected by testers.
- **C**: 2 weeks.
- **Inspiration**: Koka, Eff. Algebraic effects.

### E7: Two-phase shadow allocation

- **Q**: Does building subtrees off-tree and appending in one shot reduce intermediate layout work measurably?
- **M**: Modify `mountChild` for elements with ≥3 children: build entire subtree in `DocumentFragment`, then single `appendChild`. Measure layout/style work via `PerformanceObserver` (`layout-shift`, `style-recalc` if available, otherwise frame budget) on `examples/perf-dashboard`.
- **GRADUATE**: ≥15% reduction in style-recalc time on dashboard journey.
- **KILL**: <5% reduction OR any correctness regression OR ≥5% wall-clock regression on smaller mounts.
- **C**: 2 weeks.
- **Inspiration**: GPU render passes, network packet batching.

### E8: Visibility-gated effect execution

- **Q**: Does deferring offscreen effect runs reduce work measurably on long pages?
- **M**: Tag effects with target node + `IntersectionObserver`. Queue runs while invisible, replay on entry. Build `examples/experiments/long-list/` (10k items, mixed reactive cells) and measure scroll-frame budget before/after.
- **GRADUATE**: ≥30% reduction in effect runs during scroll OR sustained 60fps where current drops.
- **KILL**: any visible-content correctness bug OR <10% reduction.
- **C**: 2-3 weeks.
- **Inspiration**: game-engine frustum culling.

### E9: Frame-budget scheduler with priority lanes

- **Q**: Does explicit yielding cut dropped frames under heavy update load?
- **M**: Replace scheduler with a budget-aware version (16ms budget, lanes: visible-DOM > offscreen > prefetch > idle). Stress test with `examples/perf-dashboard` cranked to 1000 reactive elements + 60fps animation overlay.
- **GRADUATE**: dropped frames go from N to ≤N/3 under stress.
- **KILL**: <30% reduction OR any priority-inversion bug.
- **C**: 3 weeks.
- **Inspiration**: Unity's update lanes, RTOS priority scheduling, React concurrent mode (the parts that worked).

### Phase 2 checkpoint (end of Week 5)

Score each. Decide: ship as PR / promote to RFC / kill. Phase 1 + Phase 2 results together either point to a clear architectural direction or confirm the current architecture is already optimal.

## Phase 3 — Research (Months 2-3)

Run **≤1** of these, ONLY if Phase 1+2 surfaced a strong direction worth betting on. These are 6-12 week investments, not "experiments."

### E10: Compile-to-state-machine

- **Q**: Can a non-trivial Pyreon component compile to a state table without combinatorial explosion?
- **M**: Build a compiler pass that takes one component module and emits `(stateTable, transitionFn)` + a 3KB interpreter. Run on `<Card>` (simple), `<Form>` (medium), `<Table>` (complex). Measure: state count, table size, runtime perf, bundle delta.
- **GRADUATE**: even `<Form>` fits in <500 states; bundle delta ≤+20% for runtime, but generated code ≥30% faster.
- **KILL**: state explosion at trivial complexity (>500 states for `<Card>`).
- **C**: 6-8 weeks.

### E11: Profile-guided template specialization

- **Q**: Can build-time PGO produce specialized templates for hot paths that materially outperform generic templates?
- **M**: Add dev-mode telemetry that records template mount counts. After a real session, identify top 10 templates. Build a compiler pass that emits hand-optimized DOM construction for those (every `_bind` inlined, every property direct-set).
- **GRADUATE**: hot template throughput ≥25% faster; bundle growth ≤10%.
- **KILL**: <15% win OR unmaintainable code-gen.
- **C**: 4-6 weeks.

## Modern-API additions (added post-E1)

Two real wins identified during the perf-experiments planning that weren't in the original Phase 1/2 set. Both target navigation perf, which doesn't show up on `<For>` benchmarks but matters in real apps.

### E12: Speculation Rules in `@pyreon/router`

- **Q**: Does declarative prerendering via the Speculation Rules API meaningfully cut perceived navigation latency, and does the ~50KB-per-prerender memory cost stay bounded under realistic prefetch patterns?
- **M**: Add a `<script type="speculationrules">` emitter to `@pyreon/router` for routes already marked `prefetch="intent"`. Browsers fully prerender the next page in the background. Measure first-meaningful-paint on intra-app navigation in the perf-dashboard with N route variants. Watch heap growth with `--browser-args=--enable-features=SpeculationRulesPrefetchFuture`.
- **GRADUATE**: ≥50% reduction in perceived navigation latency on prefetched routes AND ≤2× heap growth at steady state with 5 prerendered candidates.
- **KILL**: heap explodes (>5×), OR no measurable navigation win, OR triggers prerender cancellations >50% of the time (browser bailing out).
- **C**: 1 week.
- **Modern-API alignment**: Speculation Rules is the canonical browser primitive for this use case. Hand-rolling `<link rel=prefetch>` doesn't actually prerender; speculation rules do.

### E13: Worker-pool for `@pyreon/router` loaders

- **Q**: Does offloading CPU-heavy router loaders to a worker pool measurably improve main-thread responsiveness during navigation?
- **M**: Add an opt-in `loader: { worker: true }` option to route definitions. Loader functions run in a `Worker` via `Comlink`-style RPC; result is post-message'd back. Build a synthetic CPU-heavy loader (parse 500KB of JSON + regex over it). Measure main-thread frame budget during the load, before/after worker offload.
- **GRADUATE**: main-thread blocking time during a heavy-loader navigation drops by ≥50% AND no measurable wall-clock regression for cheap loaders (overhead of worker dispatch must amortize).
- **KILL**: cheap-loader regression >5%, OR worker dispatch+postMessage cost wipes the heavy-loader win, OR Comlink-style RPC adds prohibitive bundle size (>30KB gz).
- **C**: 2 weeks.
- **Modern-API alignment**: Web Workers are the only way to actually free up the main thread during compute. Other "async" idioms (microtasks, scheduler.yield) just yield within the same thread.

## Calibration learning from E1 (added post-E1)

E1 (speculative monomorphic `mountFor`) ran cleanly through the Phase 0 pipeline and produced a clear DEFER. The result surfaced a real rubric problem worth flagging for future Phase 1 picks:

**The 15% wall-clock GRADUATE threshold is unfair when the targeted optimization isn't the dominant cost in the chosen journey.** E1 picked the canonical chat journey because it's the canonical append-heavy shape — but the chat journey's wall-clock is dominated by 1000 `cloneNode` calls (~180ms), not by the LIS / position-update work that E1 optimized (~40µs total). Even a perfect optimization of the targeted layer can only move the dominant cost by ~0.02% — well below the noise floor.

**Rule for future Phase 1 / Phase 2 experiment scheduling:**

Before locking the GRADUATE threshold for an experiment, verify:

1. **The targeted layer is actually the dominant cost in the chosen journey.** Quantify: "this experiment optimizes layer X, which contributes Y% of journey wall-clock per a baseline counter analysis." If Y < 30%, even a 100% improvement on layer X yields ≤30% on wall-clock — and the rubric should be set against layer X's cost (counter-based), not against wall-clock.
2. **If the targeted layer's cost is structurally below measurement noise**, switch to counter-based GRADUATE criteria. E.g. instead of "≥15% wall-clock," use "≥X% reduction in `runtime.mountFor.lisOps`" or "≥Y% drop in allocation count from `_reusableKeySet.add` call site."
3. **Be honest in the experiment writeup** about which level the win lives at. A "wall-clock neutral but counter-down by 80%" result is still a real win — just at a different layer than the user perceives. Mark such results as GRADUATE-LAYER (counter-level win, not wall-clock-level), distinct from GRADUATE-USER (perceived wall-clock win).

E1's RESULTS.md captures this and recommends a 10k+ row stress journey for re-evaluation. Future experiments should ALSO check journey/layer fit before starting.

## Measurement framework

Every experiment writes one JSON file per measurement run (`results/<experiment>/<sha>.json`, schema in 0.4). Existing infra (`bun run perf:diff`) compares two such files. CI workflow `.github/workflows/perf.yml` posts the delta to the PR.

**Always report median + p90 + sample count, never a single number.** The flaky `ssr-overhead.test.ts` we hit in PR #324's session is a sign — perf measurements under multi-process load are noisy.

**Subjective metrics (E3, E6 readability)**: 1-person scoring is biased. Either get ≥3 testers OR replace with a quantified proxy (e.g., "time to first interaction" instead of "feels instant").

## Decision rubric

Apply at each Phase checkpoint. Written before experiments start so they can't be moved.

| Outcome | Action |
|---|---|
| All criteria hit | **GRADUATE** → write RFC + plan, queue as a real PR series |
| Some criteria hit, marginal | **DEFER** → move to Phase 3 backlog with notes |
| No criteria hit | **KILL** → write postmortem in `RESULTS.md` (what was tried, what didn't work, why). Saves the next person 4 weeks. |

## Sequencing

```
Week 0:    Infra setup (0.1-0.7)
Weeks 1-2: Phase 1 — E1-E5 in parallel worktrees
           → checkpoint
Weeks 3-5: Phase 2 — 2-4 of E6-E9, prioritized by Phase 1 results
           → checkpoint
Weeks 6+:  Decide: ship wins, write RFCs for graduates, OR commit to Phase 3
           research on the most promising direction.
```

## Risks

1. **Other concurrent work in main**: experiments will go stale fast. Each experiment branch should rebase on main weekly OR explicitly document the baseline SHA and not rebase. Pick one strategy per experiment in advance.
2. **Bench instability**: PR #324 hit a flaky timing test under multi-process load. Run experiments on a quiet machine, use `taskset` / process priority pinning if available. Always median + p90.
3. **Subjective metrics on E3 + E6**: 1-person scoring is biased. ≥3 testers OR quantified proxy.
4. **Compounding effects**: two experiments that both show +10% might not stack to +20% — they could overlap. Combination tests in Phase 2 needed before any "we have multiple wins" claim.
5. **The honest worst case**: 8 weeks in, no pivot delivers. That's a real result — proves current architecture is at the local optimum, effort should pivot to ecosystem. Plan for this outcome explicitly so it doesn't feel like failure. The CLAUDE.md "fastest framework" claim gets corrected to honest "in the top cluster" — and the marketing message becomes about correctness / ergonomics / ecosystem rather than speed.
6. **Scope creep within experiments**: each experiment is bounded by its question. If you find an interesting tangent, write it down as a follow-up experiment — don't expand the current one. The discipline is what makes this plan finish in 10 weeks instead of 10 months.

## What this plan does NOT include

- Production rollout of any architectural pivot (separate plan after experiments graduate).
- The 5 most expensive ideas in their full form (full Resumability rewrite, full Actor-model migration, full local-first as default, full state-machine compilation, full bidirectional all components). All of those are 6-12 month commitments — only ONE can run after experiments select a direction.
- Marketing / external positioning. The framework's identity claim ("fastest", "outstanding") gets revisited only after experiments produce evidence.
- Issues / RFCs for graduated experiments. Those are opened reactively, not pre-allocated.

## How to use this plan

1. Read this whole document before starting any experiment.
2. Phase 0 is mandatory — without the harness, every experiment reinvents measurement and results aren't comparable.
3. Each experiment owner writes `RESULTS.md` to their experiment dir as they go. Don't batch the writeup at the end — capture decisions in real time.
4. Phase checkpoints are gates, not formalities. If Phase 1 returns no GRADUATE, Phase 2 isn't automatic — it's a decision to keep investing.
5. When in doubt, kill the experiment. Plans like this fail more often from "we'll just keep going" than from "we stopped too early."
