---
title: "Testing Mistakes"
description: "Common testing mistakes in Pyreon and how to fix them."
---

# Testing Mistakes

> **Generated** from `.claude/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### A/B perf harnesses that toggle variants via `git apply … 2>/dev/null` without VERIFYING the state they label

`git apply` fails ATOMICALLY (whole patch, all files) when any hunk doesn't apply — under `2>/dev/null` a mid-sequence failure silently leaves the PREVIOUS state in place, so the harness measures one variant while labeling it another (a mislabeled A/B is worse than none: it "proves" the wrong design). Real instance: the validate pure-seam INLINE-vs-OUTLINED comparison ran 3 rounds of "INLINE" that were actually the un-patched BASELINE (the multi-file fix patch conflicted with an already-applied hunk of itself), and the design verdict REVERSED once states were verified. **Rule: every A/B toggle must (a) reset to a KNOWN state first (`git checkout -- <files>`, then apply), and (b) grep a variant-unique marker before measuring — fail loudly on mismatch.** Same family as bisect-verify: a measurement whose code-state you didn't verify is not evidence.

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
