---
title: "Testing Mistakes"
description: "Common testing mistakes in Pyreon and how to fix them."
---

# Testing Mistakes

> **Generated** from `.agents/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### A verify check that passes on an empty render

"mounts, clicks and unmounts without throwing" is true of a component that rendered nothing, so `@pyreon/atlas` once reported every scenario verified while many previews were blank. Causes and rules:
  - A "renders" gate measures area or text, never child count. Name emptiness (`empty-render`) and let a declared reason (`auto-edge`, `browserOnly`, `parts`) downgrade it.
  - Ask what the component produced, not what the container holds: a wrapper renders a `display: contents` div, a Portal renders outside the container. Mount into a slot and count what the body gained.
  - A scenario is its whole pinned state. Filtering its args to the ones that have a control renders a state the verdict never covered.
  - An Element-based frame needs `block` or a width, or it shrink-wraps and block-level components collapse to zero width (same contract as app roots in `.agents/rules/code-style.md`).
  - `isServer` is decided at module evaluation. Installing a DOM before the loader runs flips the SSR-parity oracle to a client render, so a server-gated component gets a declared `browserOnly` skip, not an early DOM.
  - Locks: `e2e/atlas-ui-components.spec.ts`, `plugins/tests/mount.test.ts`, `ui/tests/model-opening-scenario.test.ts`.

---

### A hot seam too large to inline

When every step of a path measures cheap and the whole does not, rebuild the same steps as a tiny function and compare. If that closes the gap, split the cold branches out rather than optimizing any step. `@pyreon/validate`'s `parse()` keeps only the pure-JIT fast path in its body; the general path and failure path live in module-level `parseGeneral`/`pureFail`. Reference: `packages/fundamentals/validate/src/core/schema.ts:parse`.

---

### Fixture-only proof that a gated lint rule fires

A rule's fixture proves it can fire; only real source proves it fires on code as written. `rule-fires.test.ts` (fires + quiet fixture per rule) does not cover rules that every shipped preset disables, so probe those separately with the gate lifted, using a positive control shaped like real code. Traps:
  - A dependency-gated rule never fires at a synthetic path with no `package.json` above it. Write a real project on disk.
  - A rule's name is not its subject: `no-circular-import` is a package layer-order rule, not an import-cycle detector.
  - A lexical scan sees code inside strings (manifest `longExample`s); an AST rule does not.
  - When a concept has two spellings (JSX and `h('div', …)`), a rule covering one is half a rule.

---

### A guessed rank table in a layer rule

Encode only documented layer order. Packages outside the documented chain (`connector-document`, `document-primitives`) stay unranked, which makes the rule ignore them; a plausible guessed rank produced dozens of false `error` findings. Keep the `core` and `ui-system` orders independent — a ui-system package importing a core one is the normal direction. Run the real rule over the whole tree before trusting a table.

---

### Reading a two-median difference as a framework cost

An estimator like `replace − fresh` includes work the control arm pays too (Vanilla's `innerHTML = ''` removes n live rows in replace mode). Rules:
  1. Subtract the control arm's same difference.
  2. A ratio between two sizes is a scaling claim only when both ends measure the same quantity.
  3. Lead with an operation count or structural argument, not a timing exponent. `<For>` clear is O(n) because it performs one `replaceChildren` and zero `removeChild`, and `handleFastClear` is one pass over `cache.values()`.
  4. A difference of medians inherits every confound the arms don't share (`table-layout: auto` reflow, unequal DOM work). Fit the whole curve, run the sweep in both orders, report CIs, and measure confounds.
  Reference: `examples/benchmark/bench-teardown-curve.ts` (incl. `--dom-control`).

---

### Spying on a DOM primitive in happy-dom vs Chromium

Happy-dom implements `replaceChildren` as a `removeChild` loop, so a `removeChild` spy reads n+2 there and 0 in Chromium. Suppress the counter while the bulk primitive runs (`inBulk`), or better, record `parent.childNodes.length` per bulk call (`[n + 2]` = bulk call removed the rows). `el.remove()` routes through `removeChild` in happy-dom but not Chromium. Reference: `packages/core/runtime-dom/src/tests/for-clear-bulk-dom-ops.test.tsx:recordRemovals`.

---

### Microbenchmark with a constant input

A loop-invariant call can be hoisted or dropped by V8, so the cell measures inlinability. A result sink does not fix it; rotate a pool of same-shape, different-value inputs. A number below the physical floor of the operation (a regex, a hash lookup) means the harness is wrong. Reference: `packages/fundamentals/validate/bench/validation.ts` (`POOL`).

---

### Running one arm's processes consecutively

A load burst then lands on one library and reads as a real regression. Round-robin process runs across arms (process 1 for every library, then process 2) so a burst widens every CI together.

---

### Uniform per-item timings across arms

When arms doing different work agree to three significant figures, you are measuring shared setup. Time only the part that differs (the explicit compile call) and report `—` for libraries that have no such step.

---

### In-process micro-probe slot bias

Calling every arm through one `batch(fn)` site penalizes the first arm and favours the last by more than a sub-ns effect. Add a discarded warm arm first and a duplicate of the arm under test last; if the duplicate disagrees by more than the effect, the probe cannot decide. Take verdicts from the process-isolated runner (`bench/four-cells.ts`). Reference: `packages/fundamentals/validate/bench/decompose-seam3.ts`.

---

### A/B toggles via unverified `git apply`

`git apply` fails atomically, and under `2>/dev/null` the harness silently measures the previous state under the new label. Reset to a known state (`git checkout -- <files>`) before applying, and grep a variant-unique marker before measuring.

---

### A probe run outside the workspace

`bun /tmp/probe.ts` resolves `@pyreon/*` from the global bun cache, not the workspace, and prints plausible stale output. Keep probes inside the workspace (or run them via vitest). A compiler probe must state which backend ran (`transformJSX` prefers the native binary); a spawn-based or `lib/`-reading probe needs `bun scripts/bootstrap.ts` first.

---

### A ceiling probe that reuses one warm object

A path that clones a fresh node per iteration walks cold memory, so a probe against one long-lived node understates the cost and the saving. Match the probe's allocation shape. If an end-to-end result beats its own ceiling, the probe is wrong.

---

### Comparing against a baseline from a different fixture

Adding an arm to a shared page changes the document the other arms run in. Re-measure both arms on the same fixture and size the noise floor from a control the change cannot affect (Vanilla on the create-split harness).

---

### Hand-written cross-framework arms

An arm written "at compiler-output level" is easiest to write in its fastest form and may omit costs the real compiler emits (`babel-preset-solid` emits a lazy `get depth()` getter, not an eager value). Compile the snippet through the real preset, add the compiler-shaped variant as a second arm, report both, and interleave arms per pass.

---

### Assuming a competitor's behaviour from its API shape

Verify it from its emitted code or an executed identity check. zod 4.5's compiled parser clones objects and arrays (`Z.parse(x) === x` is false), so "return the input by reference" was never a lever. Cross-library ratios are quotable only from the process-isolated bench; in-process A/Bs of our own emits are fine.

---

### A bench fixture that mismatches the API

`@pyreon/storage`'s bench once handed a `getItem/setItem` shim to `createStorage` (which needs `StorageBackend {get,set,remove}`), so every write threw inside the quota-guard `try/catch` and the bench timed error handling. Rules: the correctness gate asserts the effect being measured (read the backing store after a write); annotate fixtures in untypechecked dirs (`const backend: StorageBackend = …`); when parts sum far below the measured total in a `try/catch` path, profile it. Reference: `packages/fundamentals/storage/bench/storage-bench.ts:makePyreon`.

---

### happy-dom fires `hashchange` for `pushState`/`replaceState`

Real browsers don't. happy-dom queues it on a `setTimeout`, so a stale echo from one test can supersede the next test's navigation (passes alone, fails in the full file). Any package driving a real router in happy-dom must install `installHappyDomHashchangeEchoGuard()` via `setupFiles`, imported from the subpath `@pyreon/test-utils/happy-dom-hashchange-guard` (the barrel pulls framework src instances and trips the duplicate-instance sentinel). The guard swallows only echoes of hash-changing history calls; manual `HashChangeEvent`s (empty `oldURL`) and `location.hash =` assignments pass through. Reference: `packages/core/router/src/tests/setup.ts`, `packages/fundamentals/a11y/src/tests/setup.ts`, regression `a11y/src/tests/router.test.tsx`.

---

### Spawning a JVM toolchain per check

In `@pyreon/native-compiler` the cost of `kotlinc` was JVM start, not compilation. One warm compiler JVM per test run (vitest `globalSetup: src/tests/global-setup-kotlin-daemon.ts`) with stubs pre-compiled to a jar replaces per-check spawns; plain `kotlinc` remains the fallback and a parity spec locks both to identical verdicts. Scope a warm resource to the run: vitest's forks pool starts a process per test file. Check that an "invalid" probe is actually invalid (`String + Int` is legal Kotlin). Measure a toolchain's start against its work before sharding or caching.

---

### Running vitest from the repo root

Per-package configs (timeouts, setup files, serial files) apply only when vitest resolves them. The root `vitest.config.mts` routes via `test.projects: ['packages/*/*/vitest.config.ts', 'examples/*/vitest.config.ts']`, so a cross-package invocation runs each file under its own package config. Totality is locked by `packages/internals/test-utils/src/tests/root-vitest-projects.test.ts`.

---

### Running `bun test`

Use `bun run test` (runs vitest via package scripts)

---

### An inked-pixel count on a fully painted canvas

`inkedPixels()` reads the same before and after any change on a host whose ground is painted (treemap, heatmap). Use a channel checksum for "the frame changed" and the count for "something was drawn". A `flush()` is one rAF, so a snapshot after it is already a tween tick; sample several frames to assert a tween. Reference: `packages/fundamentals/charts/src/engine/host-parity.browser.test.tsx:checksum`.

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

### Stale DOM references in compat-layer tests

The `*-compat` layers replace the component's DOM subtree on every state change, so a node captured before a click is detached afterwards. Re-query after each state change: `container.querySelector('#x')!.click(); await flush(); expect(container.querySelector('#x')!.textContent)…`. Reference: `packages/tools/react-compat/src/react-compat-rerender.browser.test.tsx`.

---
