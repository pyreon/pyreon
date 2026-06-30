---
title: "Lifecycle & Cleanup Mistakes"
description: "Common lifecycle & cleanup mistakes in Pyreon and how to fix them."
---

# Lifecycle & Cleanup Mistakes

> **Generated** from `.claude/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### Position-based pop for stack frames unmounted out-of-order (ERROR-BOUNDARY STACK)

same bug class as the context-stack one below, different shared array. `ErrorBoundary` pushed its error handler onto a module-level `_errorBoundaryStack` and registered `onUnmount(() => popErrorBoundary())` where `popErrorBoundary` did `stack.pop()`. Sibling boundaries unmount in renderer-driven order — keyed `<For>` removing a non-last item, `<Show>` flipping the FIRST of several, route nav unmounting an outer of nested routes — so a non-last sibling's `onUnmount` popped the LAST sibling's handler instead of its own. Survivor's handler gone from the stack; orphan's handler at the top. Subsequent throws in the survivor's children dispatched to the orphan (whose owning boundary is disposed → `error.set(err)` is a no-op) → error silently swallowed AND survivor's fallback never rendered. **Fix**: `popErrorBoundary(handler)` accepts the handler reference and removes by IDENTITY via `lastIndexOf + splice`. Each `ErrorBoundary`'s `onUnmount` passes its OWN handler. Reference: `packages/core/core/src/{component.ts:popErrorBoundary, error-boundary.ts:71}`. **The class generalizes**: any time framework code does `push(X)` at setup + `pop()` at cleanup on a module-level array, ask "can X be removed in non-LIFO order?" If yes, switch to `lastIndexOf + splice` with the pushed reference.

---

### [CLIENT-SUPERSEDED — applies to genuine module-level stacks] Position-based pop for stack frames that may be pushed by reactive boundaries

`popContext()` does `stack.pop()` — pops the LAST frame. **Pyreon client context no longer uses a global stack** (owner-based: `provide()` writes onto the component's `EffectScope` owner, released when the scope is disposed — no orphan-frame growth, no position-pop hazard), so this no longer applies to client `provide()`/`useContext()`. It **still applies** to any genuine shared module-level stack: the **SSR request-scoped stack** (consumed via `pushContext`/`popContext`/`removeContextFrame`, isolated per request) and the **`*-compat` layers' own stack-based provide/inject**. For those, if you push onto the stack and a reactive boundary's effect can run during your lifetime, never use a position-based pop for cleanup — capture the pushed frame reference at push time and register cleanup as `() => stack.splice(stack.lastIndexOf(frame), 1)` (identity-based removal via `removeContextFrame`). The historical client-side amplification (hundreds of thousands of orphan frames under nested reactive boundaries × toggles) is the bug the owner model structurally eliminated. Reference: `packages/core/core/src/context.ts:removeContextFrame`; the `ctx-stack-growth-repro.test.tsx` regression now asserts the owner model keeps the (compat/SSR) stack bounded.

---

### A per-view `dispose()` destroying a SHARED, lazily-cached resource

when a reactive primitive is a *view* over a resource that is keyed/cached and shared by other consumers (a `WeakMap<Y.Doc, Awareness>` shared by N transports + N views; a module-level connection pool; a ref-counted singleton), its `dispose()` must tear down ONLY what that view added (its own listener/subscription), NOT the shared resource. Tearing down the shared resource on one view's dispose strands every other holder — and because Pyreon auto-calls `dispose` via `onCleanup` on component unmount, a SINGLE component unmounting silently kills the resource for the whole app. **Fix shape**: ownership lives with the thing that CREATED/keys the resource (the doc owns its awareness → `YjsCrdtDoc.destroy()` → `destroyDocAwareness`), not with any view; the view's dispose is listener-detach only; "announce departure"-style side effects belong on the transport/connection layer, not the view. **Real-world hit**: `@pyreon/sync`'s `syncedAwareness().dispose()` originally did `aw.destroy()` + `removeAwarenessStates` + `docAwareness.delete` — so disposing one presence view (or one component unmounting) destroyed the doc-shared `Awareness`, killing the transport + every sibling view. Fixed to listener-only; the doc owns teardown. Bisect-locked by the multi-view + `doc.destroy()` specs in `packages/fundamentals/sync/src/tests/awareness.test.ts`. **The smell to watch for**: a `dispose()` that calls a `.destroy()` / `.delete(key)` on something it `get`-or-`peek`'d from a shared cache rather than something it allocated itself.

---

### Nulling WebSocket handlers before `close()`

`ws.onmessage = null; ws.close()` — a queued message arriving between null-assignment and close fires a null handler and crashes. Always `close()` FIRST, then null the handlers.

---

### `intentionalClose` reset on reactive dependency change

If a user explicitly calls `close()` on a WebSocket subscription and a reactive dependency (URL, enabled) changes, don't silently override `intentionalClose` and reconnect. Respect the user's explicit close unless `enabled` was explicitly provided and transitions to `true`.

---

### Silent plugin/init error swallowing

`catch (_err) { /* silent */ }` in plugin runners or async initialization hides bugs. Always log in `__DEV__` mode and call user-provided `onError` callbacks. Reference: `store/src/index.ts` (plugins), `storage/src/indexed-db.ts` (IndexedDB init).

---

### An `async` `_mount` that lazy-loads a heavy engine, with `dispose()` gated only on `view.peek()`

(the editor-adapter async-mount-lifecycle class — `@pyreon/rich-text` + `@pyreon/code` both shipped instances). A WYSIWYG / code-editor adapter creates its underlying engine (`new Editor()` / `new EditorView()`) only AFTER an `await import('@tiptap/*')` / `await loadLanguage(...)` — so there's a window where the editor is "mounting" but `view` is still `null`. Three bugs hide in that window, all confirmed in a real browser and all invisible to happy-dom / mount-only tests: (1) **dispose-during-pending-mount leaks the engine** — `dispose()` reads `view.peek()` (null mid-load), no-ops; the `await` then resolves and `view.set(editor)` creates a live ProseMirror/CodeMirror view + contenteditable DOM that nothing will ever tear down (a fast navigate-away while the lazy chunk loads is the real trigger). (2) **mount failure is an unhandled promise rejection** — the mount component does `void instance._mount(el)` with no `.catch`, so a broken extension set, a throwing extension, or a failed chunk import surfaces only as a cryptic uncaught rejection with no framework context, and the editor silently never mounts (all computeds stuck at their fallbacks). (3) **re-mount reverts to the config-time content** — if `_mount` seeds the engine from a captured `pendingContent` (the initial config), disposing + re-mounting the SAME instance (the documented user-owned lifecycle) loses every edit, because the live document lives in a separate signal. **Fix shape (all three, in `_mount`/`dispose`)**: a `mountToken` generation counter — `dispose()` (and any newer `_mount`) bumps it; `_mount` captures `const token = ++mountToken` BEFORE its awaits and bails (`if (token !== mountToken) return`, destroying the engine if already constructed) after each await, closing the leak + concurrent-mount race; wrap the body in `try/catch` routing to a config `onError` (and a `[Pyreon]`-prefixed dev `console.error` when absent) so failures never escape as unhandled rejections; track `hasMountedOnce` and seed a re-mount from the LIVE document signal (`baseJson.peek()` / `value.peek()`), not the stale config content. `@pyreon/code` shares bugs (1) + (2) (it seeds from `value.peek()` so it does NOT have (3)). Reference: `packages/fundamentals/rich-text/src/editor.ts:_mount` + `dispose`; regression-locked by the three async-mount-lifecycle specs in `rich-text.browser.test.tsx` (re-mount preserves edits / dispose-during-mount no leak / mount failure → onError), each bisect-verified.

---

### Untracked `requestAnimationFrame` loops

`requestAnimationFrame(animateFrame)` inside animation functions without storing the frame ID leaks frames when the function is called again or the instance is disposed mid-animation. Always store the ID (`_frameId = requestAnimationFrame(fn)`), cancel previous (`cancelAnimationFrame(_frameId)`) before starting new, and cancel in `dispose()`. Reference: `flow/src/flow.ts` — `_layoutFrameId` / `_viewportFrameId`.

---

### Bare `requestAnimationFrame` / `cancelAnimationFrame` in animation paths

even with frame-ID tracking, if an async function (`async layout()` awaiting `await computeLayout(...)`) reaches its rAF call site AFTER vitest tears down the test environment, the now-undefined global throws `ReferenceError: requestAnimationFrame is not defined`. All 324 tests pass, vitest reports unhandled errors, the job exits 1 — confusing. Wrap rAF/cAF in defensive helpers that no-op when the global isn't `function`-typed: `const _raf = (cb) => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : 0`. Reference: `flow/src/flow.ts` — `_raf` / `_caf`. Same pattern applies to any animation path that completes asynchronously and could land in stripped-down envs (SSR, post-teardown, web workers).

---

### `Date.now()` + `Math.random()` for unique IDs

Under rapid operations (paste, clone), `Date.now()` returns the same value within a millisecond and `Math.random().toString(36).slice(2, 6)` has only ~1.67M combinations — collision probability is non-trivial. Use a monotonic counter instead. Reference: `flow/src/flow.ts` — `_pasteCounter`.

**Detected by:** `date-math-random-id` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### Raw `addEventListener` / `removeEventListener` in component or hook bodies

Bypasses Pyreon's lifecycle cleanup — listeners leak on unmount. Use `useEventListener` from `@pyreon/hooks` which registers the cleanup automatically. The detector only flags bare `window` / `document` / common DOM identifiers (`el`, `element`, `node`, `target`) so framework-host chains like `view.dom.ownerDocument.addEventListener(...)` are left alone.

**Detected by:** `raw-add-event-listener` · `raw-remove-event-listener` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### `effect()` doing imperative work at component setup

[`pyreon/no-imperative-effect-on-create`]: `effect(() => fetch(...))`, `effect(() => document.addEventListener(...))`, `effect(() => setTimeout(...))` allocate per-instance and run synchronously during component setup — that's how PR #268's bokisch.com 20s render bug accumulated under 150 component instances. `effect()` is for pure reactive subscriptions (signal reads + signal writes); imperative work (DOM, IO, scheduling) belongs in `onMount(() => { ... })`. The lint rule narrowly flags `fetch` / `setTimeout` / `setInterval` / `requestAnimationFrame` / `requestIdleCallback` / `queueMicrotask` global calls and `document.X` / `window.X` / `localStorage.X` / `sessionStorage.X` member access inside effect bodies. Pure `effect(() => sum.set(a() + b()))` and `effect(() => console.log(count()))` are NOT flagged. Foundation hooks (`@pyreon/hooks`, `@pyreon/rx`) are exempted via `exemptPaths` because they're the layer that wraps timers/listeners FOR users — flagging them would defeat the abstraction.

---

### Statically importing a heavy module used ONLY in an event handler / lifecycle callback

[`pyreon/no-heavy-import-only-in-handler`]: `import { renderChart } from '@pyreon/charts'` at module top, with `renderChart` referenced exclusively inside `onClick={() => renderChart(el)}` (or an `onMount`/`onUnmount`/`onCleanup` callback) forces the heavy `@pyreon/charts` chunk into the INITIAL bundle even though nothing touches it until the user interacts. The fix is a dynamic `await import('@pyreon/charts')` inside the handler — the chunk then stays out of the eager graph and loads on demand. Distinct from `pyreon/no-eager-import` (info, fires on EVERY heavy static import including ones genuinely needed at render): this rule is the PRECISE, actionable counterpart — it fires only when EVERY reference to the binding is provably inside a deferred scope, so the recommended fix is unambiguous and there is no "but I need it at render" false positive. **Conservative by construction**: a single eager reference (JSX element `<Chart/>`, a module-eval `const x = renderChart`, a plain helper called at render) suppresses the report entirely — a false negative is acceptable, a false positive (telling someone to defer an import they need eagerly) is not. Heavy set defaults to the 4 documented lazy-loaded Pyreon packages (`@pyreon/charts|code|flow|document`) and is extensible via the `heavyModules: string[]` rule option. Origin: distilled from the Tier-2 resumability spike's L3 heavy-import classification — the one part of that (otherwise shelved) analysis with zero false-positive risk. **`effect` / `renderEffect` are deliberately NOT in the deferred-scope set**: their callbacks run synchronously during component setup (the `no-imperative-effect-on-create` shape), so a heavy module used in an effect body is a render-time dependency, not a deferrable one — recommending a dynamic import there is wrong. This exclusion was driven by the real-corpus e2e, not foreseen in the synthetic specs: `examples/app-showcase/src/sections/invoice/LivePreview.tsx` calls `@pyreon/document`'s `render` inside an `effect` (a legit reactive render); the initial deferred-set including `effect` false-positived there. **General lesson (reinforces the M3.B rule below)**: a new lint rule MUST be run against the real example corpus before merge — synthetic FIRES/DOES-NOT-FIRE specs only cover the shapes the author thought of; the real tree surfaces the scope semantics the author got subtly wrong (here: "deferred lexical scope" ≠ "deferred execution"). Reference: `packages/tools/lint/src/rules/performance/no-heavy-import-only-in-handler.ts`; bisect-verified — disabling the eager-guard collapses it to `no-eager-import` (the 4 conservative DOES-NOT-FIRE specs fail); validated zero-false-positive across all 577 example `.ts(x)` files via the workspace programmatic API (NOT `bunx pyreon-lint`, which resolves to a non-existent npm package — use `lintFile` from the workspace src or `bun run --filter='@pyreon/lint'`).

---

### Closure-captured `parent` in a reactive mount loop becomes stale after a sibling reconciler moves the markers

any framework primitive that (a) accepts `parent` as a setup arg, (b) inserts a marker into that `parent`, and (c) calls `parent.insertBefore(...)` from inside an effect re-run is structurally unsafe under Pyreon's `mountFor` frag-then-move pattern. `mountFor` builds its children into a `DocumentFragment` and then commits via `liveParent.insertBefore(frag, tailMarker)` — the move carries the marker and all sibling DOM along, but the inner mount's CLOSURE still holds the original (now-empty) fragment as `parent`. The next signal-driven re-run calls `insertBefore(node, marker)` against the stale fragment → throws `NotFoundError: Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node`. The throw lands in Pyreon's unhandled-effect-error path → `console.error` + complete loss of the subtree's children from the DOM. **Two real instances fixed in this bug class**: PR #776 `mountReactive` (For-of-Show batched-toggle — captured `parent` stale after `mountFor` frag-then-move), PR #783 `mountKeyedList` (For-of-direct-keyed-array — same shape, three call sites: `mountNewEntries`, `mountVNode`, `keyedListReorder → applyKeyedMoves → moveEntryBefore`). **Fix shape (both PRs)**: read `marker.parentNode` (or `tailMarker.parentNode` for keyed-list shapes) at each effect run, threading the resulting `liveParent` through every helper that does `insertBefore`. Falls back to closure-captured `parent` only when marker is detached (cleanup edge case) — the cleanup path was already consistent (`marker.parentNode?.removeChild(marker)`), only the mount/reorder paths used the stale captured `parent`. **General rule for framework code**: any mount loop running inside an effect that accepts `parent` as a setup arg should compute the live parent from a marker at each re-run — `parent` is captured at setup and the DOM moves; markers are part of the moved DOM and their `parentNode` reflects the current live parent. **Sibling primitives audited safe (2026-Q2)**: `mountFor` itself uses `startMarker.parentNode` at the top of its effect; `KeepAlive` / `TransitionGroup` / `Transition` use `containerRef.current` (live DOM-element refs that move with the surrounding tree, never become stale); `template.ts`'s `_bindText`/`_bindDirect` write to text-node `.data` only (no parent.insertBefore). **Reproducer**: `bun run perf:leak-sweep --app perf-dashboard --journeys domConditionalToggle-1000` (the For-of-Show shape; #783's keyed-list shape is reproduced by the regression test at `packages/core/runtime-dom/src/tests/keyed-array-in-for-batched-toggle.browser.test.ts` — requires For children to return a function directly so `mountKeyedList` lands with frag-as-parent, not the more common `<div>`-wrapped shape which routes through the `<div>` and isolates from the frag-move). Discovery chain: #770 leak-audit harness → #772 leak-sweep multi-journey driver → #774 it.fails CONTRACT lock → #776 mountReactive fix → #783 mountKeyedList sibling fix → #779 nightly leak-sweep CI gate.

---

### Reactive-render entry points missing `runUntracked` around child mounts

any framework primitive whose effect body mounts children (`mountFor`, `mountKeyedList`, `KeepAlive`, `TransitionGroup`, custom equivalents) MUST wrap the child mount work in `runUntracked(() => ...)` — same shape `mountReactive` already does. Without this, signal reads during a child's setup (`useQuery`'s `new QueryObserver(client, options())` reading the queryKey signal at construction time, `useTheme` reads, any `signal()` invocation in a component body) leak their subscription up to the parent effect's `activeEffect`. When the leaked signal flips, the PARENT effect re-runs → `runCleanup()` disposes ALL inner effects (the children's per-component effects), and the parent's keyed-update path skips re-mount on unchanged keys → the children's reactivity is gone forever. Real-world shape: PR #490's `queryReactiveKey-1000` journey saw 0 setOptions runs across 10 flips of a shared reactive query key — `signalWrite: 1015` confirmed the writes happened, `query.setOptions: 100` confirmed only the initial-mount runs fired, the 1000 expected re-runs never came. Fix lives at `packages/core/runtime-dom/src/nodes.ts` (mountFor, mountKeyedList), `keep-alive.ts`, and `transition-group.ts`. Bisect-verified: reverted the `runUntracked` wrap → `<For>`-shaped regression test failed with `expected 100 to be 0` (all 100 inner effects didn't fire after first flip); restored → all 11 expected runs per effect. Reference: `packages/core/runtime-dom/src/tests/fanout-repro.test.tsx`.

---

### Re-entrant signal write inside the same effect's batch flush

when an effect's run body writes to a signal it's currently subscribed to (or any signal whose ONLY subscriber is the same run), historically the batch system silently dropped the re-fire — `signal.set` wrapped the notify chain in `batch()`, the flush iterated subscribers from a Set, and JS Set iteration + Set.add idempotency meant re-enqueuing an already-visited entry was a no-op. **Fixed** by the two-tier flush in `packages/core/reactivity/src/batch.ts`: tier 1 drains `computed.recompute` callbacks (cascading-iteration with within-pass Set dedup), tier 2 drains `effect.run` callbacks in multi-pass mode (within-pass dedup preserved by Set.add idempotency on entries not yet visited; cross-pass re-fire enabled by routing already-visited entries to `_nextEffectPass`). The two-tier split is what `computed.ts:_markRecompute(recompute)` registers — the WeakSet-based brand routes computed callbacks to tier 1 so all derived values settle before any effect runs (prevents the deep-cascade stale-read shape this code path used to hide). MAX_PASSES caps tier-2 at 32 to prevent pathological infinite re-enqueues; converging patterns terminate after 1-2 passes. Reference: `packages/core/core/src/error-boundary.ts:handler` calls `error.set(err)` synchronously and the boundary's effect re-fires on the next pass (mounting the fallback). No queueMicrotask defer, no synchronous `handling` flag — both were workarounds before the structural fix and have since been removed.

---
