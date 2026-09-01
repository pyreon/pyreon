---
title: "Testing Mistakes"
description: "Common testing mistakes in Pyreon and how to fix them."
---

# Testing Mistakes

> **Generated** from `.claude/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### A fixture proves a rule CAN fire; only real source proves it fires on code as WRITTEN — and a probe at a synthetic path measures the GATE, not the rule

(the gated-rule sweep, 2026-09). `@pyreon/lint` has a totality invariant (`rule-fires.test.ts`: every rule has a fires fixture AND a quiet counterpart), and it still left 39 rules unverified against reality, because they are OFF in every shipped preset — opt-in, monorepo-scoped, or dependency-gated — so a full-repo run under `recommended` exercises none of them. Force-enabling all 39 over 5,386 real files left 12 silent, and separating "the repo is clean" from "the rule is inert" needed a POSITIVE CONTROL per rule: construct the defect the way a real author writes it, and check. Three traps in doing that, each of which produced a WRONG verdict first. **(1) A dep-gated rule at a synthetic path can never fire** — `lintFile('/repo/src/x.ts', …)` has no `package.json` above it, so five rules read as inert when the gate was simply doing its job; the probe has to write a real project on disk with a manifest declaring the libraries. **(2) A rule's NAME is not its subject** — `no-circular-import` sounds like it detects import cycles and is in fact a package LAYER-ORDER rule, so a two-file relative cycle proves nothing about it; probing the wrong shape reported a healthy rule as dead. **(3) A lexical scan sees code inside STRINGS** — a manifest's `longExample` carries `import { enrichTheme } from '@pyreon/unistyle'` as documentation, which a regex reads as a real upward import (the same trap `@pyreon/loom` documents); the AST-based rule never saw it, so the "violation" existed only in the measurement. Two REAL gaps survived all that: `prefer-canonical-primitive` read JSX only, and Pyreon has TWO spellings for a DOM element — `@pyreon/primitives`' own web implementations are written entirely in `h('div', …)`, so a JSX-only rule reports nothing on a file made of nothing but DOM elements; and `no-circular-import` enforced `packages/core/` only, leaving `packages/ui-system/` — the tree where a real `ui-core` ↔ `unistyle` cycle actually happened and was fixed by a registration seam — guarded by nothing but that fix's own tests. **Rules: (a) a gate that runs rules under a preset says nothing about the rules that preset disables — probe them separately, with the gating lifted; (b) a silent rule needs a positive control before you call the repo clean, and the control must be the shape real code uses, not the rule's own fixture; (c) when a framework offers two spellings for one concept, a rule covering one of them is half a rule.**

---

### A guessed rank table is worse than no rank table

(same sweep). Widening the layer rule to `packages/ui-system/` meant encoding an order, and two packages — `connector-document`, `document-primitives` — are not in the documented chain. Ranking them by eye put them beside `elements` when they in fact sit above it: **41 findings in a tree with zero real violations**, in an `error`-severity rule that gates CI. Omitting them entirely is correct — an unranked package is simply ignored, so the rule keeps guarding the edges it actually knows. **Rule: encode only what is DOCUMENTED, measure the whole tree with the REAL rule before trusting the table, and prefer a known-incomplete table to a plausible-looking complete one.** Note the two orders must also stay INDEPENDENT: `core` and `ui-system` are separate stacks and a ui-system package importing a core one is the normal direction, so a single merged rank table would flag every such import.

---

### A "difference of two op medians" estimator is not a framework cost until the CONTROL arm's same difference is subtracted — and a RESIDUAL is the wrong statistic for a complexity claim

a create-path split harness reported keyed teardown as `pyreon.replace.js - pyreon.fresh.js` and printed the Vanilla arm's identical difference beside it labelled `(noise floor)`. It is not noise: Vanilla's `renderAll` opens with `innerHTML = ''`, which clears an EMPTY host in fresh mode and n live `<tr>` in replace mode — so that term is the browser removing n nodes, 545–645µs at 1,000 rows, 5–7× the part attributable to Pyreon. Reading the uncorrected figure as "teardown" at 1,000 rows and comparing it against a corrected excess at 10,000 produced an apparent **43× growth for a 10× row increase**, which reads as a complexity bug and was escalated as the framework's highest-value perf lever. **Correcting the endpoints is necessary but not sufficient, because a residual is a difference and therefore inherits every confound the two arms do not share.** Two were live here, both n-dependent and neither Pyreon's: (a) the fixture ran `table-layout: auto`, which re-measures the whole table on any mutation that can widen a column — worth ~30% of the n=10,000 absolute, and the reason a per-row column that is FLAT on `table-layout: fixed` (85–125 ns/row, exponent 0.92–1.07 across 100× of rows) tilts upward to 175 ns/row without it; (b) the arms did not perform the same DOM work — Pyreon calls `tbody.replaceChildren()` over n+2 children while the Vanilla control calls `host.innerHTML=''` over ONE child, orphaning the rows as a subtree, a difference measured at 5–38 ns/row and rising with n. **Rules.** (1) Subtract the control arm's SAME difference; an estimator both arms pay measures the platform. (2) A ratio between two sizes is a scaling claim only when both ends are the same quantity — otherwise it is two numbers with a division sign. (3) **Lead with an operation COUNT or a structural argument, not an exponent.** The load-bearing evidence that this teardown is O(n) is that a clear performs exactly one `replaceChildren` and zero `removeChild` regardless of n, and that `handleFastClear` is one pass over `cache.values()` — both checkable and lockable; the timing exponent only corroborates. (4) A difference-of-four-medians carries the noise of all four, so any exponent read off its endpoints is unfalsifiable: fit the whole curve, run the row sweep in BOTH orders (the largest n otherwise always runs last, confounding size with session age), report the CIs, and subtract the measured confound rather than disclaiming it in prose. Reference: `examples/benchmark/bench-teardown-curve.ts` (curve, drift probe, order control, and a `--dom-control` that prices the arm asymmetry itself).

---

### Spying on a DOM primitive counts the ENGINE's implementation of it, not your framework's calls — and happy-dom and Chromium disagree about which primitive is primitive

a spy on `Node.prototype.removeChild` during a `<For>` clear of 1,000 rows reports **0 calls in Chromium** and **n+2 in happy-dom**, because happy-dom implements `replaceChildren` as a `removeChild` loop while Chromium's is native. A test asserting "zero per-row removals" therefore passes in the browser and fails in the unit harness, and — worse — a test written to the happy-dom number would assert the OPPOSITE of the shipped behaviour. **Fix: suppress the counter for the duration of the bulk primitive** (`inBulk` flag set inside the patched `replaceChildren`), so the count is "calls the framework itself made". Note the honest limit even then — it is engine-specific in the other direction: `el.remove()` routes through `Node.prototype.removeChild` in happy-dom but NOT in Chromium, so a refactor to `.remove()` would be counted in one engine and invisible in the other. **The assertion to lean on is the one that needs no suppression and no engine assumption: record `parent.childNodes.length` AT the bulk call — `[n + 2]` proves the bulk call is what removes the rows, `[2]` proves per-row cleanups detached first. Record it PER CALL, not as a running sum, or two calls that happen to add up are indistinguishable from one.** Same family as "happy-dom is not a real browser", but sharper: here the harness does not merely under-model the engine, it inverts the measurement. Reference: `packages/core/runtime-dom/src/tests/for-clear-bulk-dom-ops.test.tsx:recordRemovals`.

---

### A microbenchmark that calls the same function with the SAME input every iteration measures how INLINABLE the callee is, not how fast it is

(the validation-library suite, 2026-08). A loop-invariant call is a loop-invariant computation, and V8 is entitled to hoist it out of the timed loop or drop it. Measured directly: ArkType's `string.email` cell read **~3ns/op** — below the cost of the regex the check must perform, i.e. the work had stopped happening — while Pyreon and TypeBox, whose validators V8 did not manage to hoist, kept reporting their real ~28ns. The table was ranking inlinability. **A result SINK does not fix it** (`if (run(x) === neverReturnedSymbol) sink++` still lets a hoisted value satisfy the comparison); only VARYING THE INPUT does. Rotate a pool of SAME-SHAPE, different-value inputs so the object maps stay monomorphic and every entry does identical work — the pool defeats hoisting without changing what is measured. **The tell is an absolute number below the physical floor of the operation** (a regex test, a hash lookup, a DOM crossing); when one arm reads implausibly fast and its neighbours do not, suspect the harness before believing the winner. Same family as "verify the harness before trusting its result". Reference: `packages/fundamentals/validate/bench/validation.ts` (`POOL` + the sink's own docblock).

---

### Running one arm's PROCESSES consecutively lets a load burst land entirely on that arm

(same suite). Per-cell process isolation with N pooled processes is the right shape, but scheduling them lib-by-lib (all of A, then all of B) is not: on a shared machine a contention burst outlasts a single cell, so it hits whichever library was running and shows up as a lopsided ROW rather than as noise. Observed: a Pyreon cell read **155ns against its own 5ns** on the interleaved schedule — a 31× artifact that reads exactly like a real regression. **ROUND-ROBIN the processes across the arms in a row** (process 1 for every library, then process 2, …) so a burst widens every CI together — and a widened CI reads as a 🤝 tie, which is the conservative failure. This is the cross-library twin of the repo's existing "round-robin timing runs so GC/tier debt spreads across cells" rule.

---

### A per-item measurement that comes out UNIFORM across items that do very different work is measuring the shared setup, not the item

(same suite). A "setup cost" table timed `build the scenario, then bind library L` — but building the scenario constructed EVERY library's schema, so all nine columns read ~1.4ms of shared construction and the per-library compile was invisible. Nine libraries doing genuinely different amounts of work cannot legitimately agree to three significant figures; **uniformity across arms is a tell, exactly as an implausibly-low absolute is**. Fixed by measuring only the thing that differs — the explicit compile CALL (`z.compile` ~55µs, `TypeCompiler.Compile` ~48µs on the same schema) — and reporting `—` for the libraries that compile lazily or at definition time rather than printing a number that measures something else for them.

---

### A/B perf harnesses that toggle variants via `git apply … 2>/dev/null` without VERIFYING the state they label

`git apply` fails ATOMICALLY (whole patch, all files) when any hunk doesn't apply — under `2>/dev/null` a mid-sequence failure silently leaves the PREVIOUS state in place, so the harness measures one variant while labeling it another (a mislabeled A/B is worse than none: it "proves" the wrong design). Real instance: the validate pure-seam INLINE-vs-OUTLINED comparison ran 3 rounds of "INLINE" that were actually the un-patched BASELINE (the multi-file fix patch conflicted with an already-applied hunk of itself), and the design verdict REVERSED once states were verified. **Rule: every A/B toggle must (a) reset to a KNOWN state first (`git checkout -- <files>`, then apply), and (b) grep a variant-unique marker before measuring — fail loudly on mismatch.** Same family as bisect-verify: a measurement whose code-state you didn't verify is not evidence.

---

### A probe run from OUTSIDE the workspace resolves a STALE copy of the package it is probing, and answers confidently with the wrong codegen

(2026-08). A one-off script written to `/tmp` and run as `bun /tmp/probe.ts` does NOT get the repo's workspace resolution — `@pyreon/compiler` resolves out of the global `~/.bun` cache, so the probe reports whatever version happens to be cached there. Observed while decomposing the hydration marker cost: a probe of `_tpl` ref emission printed every ref re-walking from the root (`__e1 = __root.firstElementChild.nextElementSibling`), i.e. O(K²) DOM reads for a K-child template — which reads as a systematic, shippable codegen defect and was one edit away from being "fixed". The CSE that prevents it (`chainFromCaptured` / `capturedRefs` in `jsx.ts`) had in fact shipped long before, with its own bench and measured −9.1%. Copied VERBATIM into `packages/core/compiler/` and re-run, the same probe printed the chained form (`__e1 = __e0.nextElementSibling`). **Rule: an ad-hoc probe of a workspace package must live INSIDE the workspace (or run through vitest) — a `/tmp` script's imports are resolved by a different module graph than the repo's, and the failure mode is not an error but a plausible, confident, WRONG answer.** Two compounding traps in the same family: `transformJSX` prefers the NATIVE binary, so a compiler probe must also state WHICH backend produced its output (temporarily moving `native/pyreon-compiler.node` aside is the cheap way to compare, and is how the two were confirmed to agree here); and a spawn-based or `lib/`-reading probe needs `bun scripts/bootstrap.ts` first. Same root as the dual-backend bisect rule: verify what your harness actually loaded before believing what it printed.

---

### A ceiling probe that reuses ONE warm object predicts the wrong number for a path that allocates a fresh one per iteration

(the ref-walk instance, 2026-08). `probe-refwalk.ts` measured the compiler's per-child DOM pointer walks against a single long-lived `<tr>` read 10,000 times — every read hitting a hot cache line — and reported the 8-cell saving as 2.05ms/10k rows. The real mount clones a NEW row per iteration (`_tpl`), so the walk is always cold; measured against a fresh clone the same saving is **3.31ms/10k**, and the end-to-end A/B beat the hot ceiling by ~2.5×. **A "ceiling" that comes out BELOW the real number is not a ceiling — it is a different workload.** The direction matters: a hot probe understating a win makes you DECLINE a real optimization with a number, which is the most expensive kind of wrong. Rule: match the probe's ALLOCATION shape to the path being predicted (fresh clone vs reused instance, cold vs warm cache), and when an end-to-end result beats its own ceiling, treat that as the probe being wrong rather than as a bonus — chase it until the two agree.

---

### Comparing a measurement against a baseline taken on a DIFFERENT page/fixture, and reading the difference as the change's effect

adding an arm to a shared profiling page changes the document every OTHER arm is measured in (a forced layout flush lays out the whole document), so a before/after across that edit conflates the code change with the fixture change. The fix is an in-run CONTROL: on the create-split harness, Vanilla is hand-written DOM that no compiler change can touch, so its own spread across runs (755–805µs, 6.6%) IS the instrument's drift — and any Pyreon delta smaller than that is unreportable. In the ref-chaining PR this is what turned "narrow row got 45µs worse" from an apparent regression into the correct verdict of a tie: the predicted saving there was ~22µs, 2–4× below the measured drift. Rule: re-measure BOTH arms on the SAME fixture, and size the noise floor from a control the change provably cannot affect rather than from the run-to-run spread of the thing you are trying to move.

---

### A cross-framework arm hand-written at "compiler output level" silently omits costs that framework's REAL compiler emits — measure both shapes before publishing the ratio

the deep-component-tree scenario passed Solid `createComponent(Node, { depth: props.depth - 1 })` with the arithmetic evaluated EAGERLY, while Pyreon's compiler lowers the same source to `_rp(() => props.depth - 1)` — a lazy getter, and (because each level's getter closes over its own props) a CHAIN that costs O(depth) per read. But `babel-preset-solid` emits `get depth() { return props.depth - 1 }` for exactly that expression — VERIFIED by compiling the snippet through the installed preset rather than assuming it — so real Solid pays the same class of cost: adding the getter moved Solid 2.75 → 3.30ms (+20%), almost precisely the +20% Pyreon pays (4.10 eager → 4.90). **26% of a headline 1.78× gap was the hand-written arm, not the framework.** The scenario was NOT rigged — its author flagged the caveat in the PR body and called the number an upper bound; the lesson is that the caveat is CHEAP TO CLOSE and should be, because a published ratio outlives the paragraph next to it. **Rule: when an arm is hand-written because the framework's compiler plugin is absent from the harness, add the compiler-shaped variant as a second arm and report both — a caveat in prose is not a measurement.** The variants also make the fix's control group free: a Pyreon-only change must leave every non-Pyreon arm inside its CI, which is what proved the −8.2% real. Two sub-traps: a hand-written arm is easiest to write in its FASTEST form, so this bias is systematically anti-your-own-framework; and per-arm absolute ms drift with machine load, so INTERLEAVE the arms (alternating order per pass) rather than running one build then the other — between-run drift on a shared box exceeded the effect being measured here.

---

### A bench cell whose fixture shape-mismatches the API measures the library's own error-swallowing — and the "loss" gets documented as a Pareto trade-off

`@pyreon/storage`'s bench passed the raw localStorage-shaped shim (`getItem/setItem`) straight to `createStorage` (which needs `StorageBackend {get,set,remove}`), so `backend.set` was `undefined` and EVERY Pyreon write threw a TypeError silently swallowed by the write path's own quota-guard `try/catch` (`onError` unset). The write rows measured ~600ns of throw/catch machinery instead of the ~35ns real path — a fabricated 1.5× "loss" vs zustand that shipped as a documented "Pareto: syscall-dominated" trade-off, while Pyreon never actually persisted anything. THREE stacked failures: (1) `bench/` is outside `tsconfig include: ["src"]`, so the shape mismatch never typechecked; (2) the correctness gate asserted only the IN-MEMORY round-trip (`p() === 5`) — its header CLAIMED "write-through-to-storage" but nothing read the backing Map; (3) defensive error-swallowing in the measured path (correct for quota errors in prod) hid the wiring bug. **Rules**: a bench correctness gate must assert the EFFECT the op claims to measure (persistence bench ⇒ read the backing store after a write), not a proxy; a fixture handed to your own API in an untypechecked dir deserves an explicit type annotation (`const backend: StorageBackend = …`) so the mismatch surfaces as a red squiggle even without a typecheck gate; and any suspiciously-close loss in a path wrapped in `try/catch` should be decomposition-profiled (component sums vs measured total — 35ns of parts vs 596ns measured was the tell). Bisect-locked: the strengthened gate FAILS with `pyreon write-through (mem=undefined)` against the original wiring. Reference: `packages/fundamentals/storage/bench/storage-bench.ts:makePyreon`.

---

### happy-dom fires `hashchange` for `history.pushState`/`replaceState` — deferred, so the echo can land in the NEXT test

real browsers never fire `hashchange` for pushState/replaceState (WHATWG: only fragment navigations); happy-dom's `Location[setURL]` queues one on a `setTimeout` whenever the hash differs. Any code that treats `hashchange` as a genuine traversal (e.g. `@pyreon/router`'s browser-nav pipeline) then sees a STALE echo of a previous test's URL write — delivered mid-way through the next test, superseding its in-flight navigation with a path from the previous test. Passes in isolation, fails in the full file run; real Chromium never reproduces it. **Fix (spec-parity patch, not router code)**: wrap `history.pushState`/`replaceState` in the package's vitest `setupFiles` to count hash-changing calls and swallow that many synthetic `hashchange` events in a capture-phase listener; discriminate tests' MANUAL `new HashChangeEvent('hashchange')` dispatches by their empty `oldURL` (happy-dom populates it, manual events leave `''`). `location.hash = …` assignments are real fragment navigations and must NOT be swallowed. The shim is now the SHARED `installHappyDomHashchangeEchoGuard()` in `@pyreon/test-utils` — import it from the framework-free SUBPATH `@pyreon/test-utils/happy-dom-hashchange-guard` (the barrel pulls @pyreon/core + @pyreon/reactivity src instances into the setup context, tripping the duplicate-instance sentinel in tests that bundle built lib/) — and it MUST be installed via `setupFiles` by ANY package driving a real router in happy-dom (the router's default mode is `hash`, so every `router.push` is a hash-changing pushState; `@pyreon/a11y` was the latent second instance — its route announcer fired for a prior spec's echo under CI load). Reference: `packages/core/router/src/tests/setup.ts` + `packages/fundamentals/a11y/src/tests/setup.ts` (wired via `setupFiles` in each vitest.config.ts; ALSO wired in `@pyreon/testing` + `@pyreon/perf-harness` — the sweep's other two real-router-in-happy-dom suites) + the deterministic interleaving regression in `a11y/src/tests/router.test.tsx` (bisect-verified).

---

### Running `bun test`

Use `bun run test` (runs vitest via package scripts)

---

### Missing cleanup

Always clean up mounted components, dispose effects

---

### Fake timers

Use real `setTimeout` with `await` — fake timers cause subtle issues

---

### Testing internals

Test public API behavior, not implementation details

---

### DOM tests without happy-dom

Packages with DOM need `environment: "happy-dom"` in vitest config

---

### Stale DOM references after re-render in compat-layer tests

`@pyreon/react-compat`, `@pyreon/preact-compat`, etc. do **full DOM subtree replacement on every state change** — there's no VDOM diffing in the compat layer (Pyreon's native pattern is fine-grained reactivity, not whole-component re-renders). A test that captures a button reference BEFORE click and asserts on `.textContent` AFTER click sees the OLD text because the captured node is now detached. **Always re-query the DOM after a state change**: `container.querySelector('#x')!.click(); await flush(); expect(container.querySelector('#x')!.textContent).toBe(...)`. Phase A2's first react-compat smoke held a stale reference and looked like a re-render bug; was actually a test-pattern bug. Reference: `packages/tools/react-compat/src/react-compat-rerender.browser.test.tsx`.

---
