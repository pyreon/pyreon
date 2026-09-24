---
title: "Lifecycle & Cleanup Mistakes"
description: "Common lifecycle & cleanup mistakes in Pyreon and how to fix them."
---

# Lifecycle & Cleanup Mistakes

> **Generated** from `.agents/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### Measuring layout in a `ref` inside `<For>`

`<For>` mounts its initial rows into a fragment and moves them into the document afterwards, so a row's `ref` fires on a detached element and `getBoundingClientRect()` returns zeros. Recording that size breaks consumers (in `@pyreon/virtual`, TanStack compensated scroll for the 0 → 40px corrections and the window rendered from the wrong row). A layout read in a `ref` must check `el.isConnected` and defer (a microtask is enough for `<For>`). Reference: `packages/fundamentals/virtual/src/detached-measure.ts` + `tests/detached-measure.test.ts`.

---

### Per-node removers for a static child of a freshly-cloned template

The question is "does this node leave with its parent?", not "who created it". A compiled `<div>{children}</div>` lowers to `_mountSlot(children, __root, <!>)`; passing a static row array to `mountChild` at `_elementDepth === 0` gave every row its own `removeChild`, so disposing a 500-row list removed rows one by one before removing the container that already held them. `mountChildAsUnit` gives a static slot value (and `_mountChild`'s non-accessor absorbed component) effect-only cleanup, like the clone's own children. An accessor slot is a reactive boundary that re-renders into the live clone, so it keeps the full remover or its previous render is stranded on every flip. Branch on `typeof children === 'function'`, never on parent depth. Reference: `packages/core/runtime-dom/src/mount.ts:mountChildAsUnit` + `template.ts:_mountSlot`; locked by `tests/slot-children-unit-teardown.test.tsx`.

---

### A stored, unformatted `Error` pins every captured frame's closure

V8 defers stack formatting, and until `.stack` is read the Error holds a call-site record per frame, each holding that frame's function and closure. The dev devtools registry kept one per signal/computed/effect in a strong Map, so nodes were never collected and their FinalizationRegistry never fired. Keep a pending Error in a `WeakMap` keyed by the node (an ephemeron value cannot keep its key alive) and cap `Error.stackTraceLimit` to the frames the parser reads. Treat any stored Error as a strong reference to every function on its stack. A retention test must build the deep chain in its own scope: closures in one function share one V8 context, so a sibling closure pins the variable regardless. Reference: `packages/core/reactivity/src/reactive-devtools.ts:_captureCallerLocation`; `tests/devtools-deferred-location-retention.test.ts`.

---

### A binding that adopts a node must still remove it on dispose

A cleanup's job depends on whether anything else will remove the node, not on whether this code created it. `bindPolymorphicText` leaves its text node in place in `text` mode, but every hydration call site binds a node in an already-live parent, so the binding owns it. Once accessors adopt their server range instead of swapping it, a nested accessor's adopted text survives its parent's re-render (`x<b>…</b>` instead of `<b>…</b>`). Hydrate sites use the `bindOwnedText` wrapper; the `<For>` row-plan caller keeps the non-removing form because its row element is removed as a unit. Re-audit child cleanups whenever a parent switches from rebuild to adopt. Reference: `packages/core/runtime-dom/src/hydrate.ts:bindOwnedText` + `tests/hydrate-accessor-adoption.test.tsx`.

---

### An effect wrapper storing its per-run cleanup in a closure

`watch(source, cb)` used to park a returned cleanup in a local `let`, so it ran only on the next re-run or an explicit `stop()` — never when the owning scope disposed the effect, which is how components use `watch`. Kinetic's `useAnimationEnd` then left a 5s timer and `transitionend`/`animationend` listeners pinning an unmounted subtree. Any wrapper whose callback may return a cleanup must hand it to the effect: `watch` calls `onCleanup(result)` inside the effect body, so it runs before each re-run, on `dispose()`, and untracked. Reference: `packages/core/reactivity/src/watch.ts`; `tests/watch.test.ts` ("per-run cleanup runs when the OWNING scope disposes").

---

### Two sources suspending one timer through one shared flag

`<Toaster>` paused auto-dismiss on hover and focus through a single `_paused` boolean, so `mouseleave` cleared a keyboard user's focus hold and the toast dismissed under them. Key holds by source identity (`'hover' | 'focus' | 'hidden'`), release individually, restart the clock only when the set is empty. Do not use a depth counter: removing a focused element need not fire `focusout`, so a count can stick above zero and freeze every later toast, while a stranded `'focus'` hold is cleared by the next `focusout`. Pause while the tab is hidden (`visibilitychange`), make the handler idempotent against its own last-known state, read `document.visibilityState` at setup, and release a held hold in `onCleanup`. `document.visibilityState` is read-only in a real browser, so the spec redefines it — read it back before asserting. Reference: `packages/fundamentals/toast/src/toast.ts` (`PauseSource`, `_pauseHolds`) + `toaster.tsx` (`syncVisibility`); `tests/pause-sources.test.ts` + `tests/toaster.browser.test.tsx`.

---

### Trusting the shipped implementation as the oracle of a differential test

When a differential disagrees, check both sides against the specification. `@pyreon/charts`' old `lttb` indexed buckets one place to the right: the first interior bucket was never considered, the last bucket was empty so the pinned final row was emitted twice (`maxPoints={N}` drew `N - 1` distinct rows), and the third triangle vertex averaged the wrong bucket beside a comment saying "next bucket". A comment describing intent next to indices that do otherwise is a strong smell in numeric code. An algorithm whose output is a selection needs invariant assertions: strictly increasing, exactly `threshold` entries, endpoints pinned. `Math.floor(i * (span / count))` is not `Math.floor(i * span / count)`; bucket edges advance by integer accumulation, which is exact and lowers to native. Reference: `packages/fundamentals/charts/src/engine/decimate-values.ts`; `decimate-parity.test.ts`.

---

### A ResizeObserver callback that writes signals after detach

`disconnect()` stops future observations, but an already-queued batch can still deliver a tick, writing a 0×0 size into the reactive graph mid-teardown or re-adding a measurement for an unmounted node. Start every signal-writing RO callback with `if (!el.isConnected) return`. Reference: `@pyreon/flow` `flow-component.tsx` (container `updateSize`, per-node `measureRef`).

---

### A detach/write/reattach window over shared subscriber state that is not exception-safe

`@pyreon/store`'s `patch()` fast path suspends each field's change detector, writes, then resumes. Three throws broke it: a throwing getter on the patch object read after suspension, a throwing wrapped `sig.set`, and a raw `subscribe` listener throwing past the drain, which left `patchInProgress` stuck and buffered every later event. Rules: read everything that can throw before the window, resume in `finally`, and reset in-progress flags plus flush buffered work in `finally` so a partial patch still emits one notification. The suspension is an O(1) Set swap (`_suspendSoleSubscriber`) guarded by `detectorEpoch`, so a mid-patch side effect that rewires detectors falls back to the per-listener path instead of suspending a user listener. Reference: `packages/fundamentals/store/src/index.ts` (`patch()`); `tests/patch-exception-safety.test.ts`.

---

### Content mounted into a live parent with no explicit remover

`mountChild` returns a no-op cleanup for element children when `_elementDepth > 0`, which is valid only when the parent is removed as a unit. A portal target such as `document.body` never is, so portaled modals and toasts stayed in the document after their owner unmounted. `<Portal>` brackets its content with `<!--portal-->…<!--/portal-->`, mounts before the end marker, and removes the whole range on dispose. Any code mounting into a parent it does not own must return a real remover. Reference: `packages/core/runtime-dom/src/mount.ts` (PortalSymbol branch); `tests/portal-dispose.test.tsx`.

---

### Module-level `WeakSet`/`WeakMap` on a per-item hot path (Class C)

Weak keys do not make the table weak. V8 never shrinks an ephemeron table after growth, so a registry every list row passes through keeps its high-water table (e.g. 32768 slots, ~256KB) for the page's lifetime. Carry the answer on the owning record instead: `ForEntry.end`/`KeyedEntry.end` record each entry's DOM extent, so `moveEntryBefore` moves the exact range with no registry. Invisible to the heap-slope leak sweep and to WeakRef tests; only heap-snapshot retainer analysis finds it. Reference: `packages/core/runtime-dom/src/nodes.ts`; `tests/for-entry-range-move.test.tsx`.

---

### Reference-typed scratch arrays kept after their pass (Class H)

A per-instance scratch buffer overwritten only on `[0..newN)` retains the stale tail when the list shrinks — here removed rows' `ForEntry`, DOM subtree and cleanup closures. Null it at the end of the pass (`scratch.fill(undefined, 0, n)`); typed-array scratch can stay as capacity. The leak sweep runs at constant size and cannot see this; the lock is a GC-observable test (WeakRefs + `--expose-gc` via the vitest config's `overrides: { test: { execArgv } }`). Reference: `packages/core/runtime-dom/src/nodes.ts:forLisReorder` + `tests/for-lis-scratch-release.test.tsx`.

---

### Introspection registries holding strong refs to DOM (Class H)

The devtools component registry stored `el` captured at mount and cleaned up only at unmount, but a reactive re-render can replace that DOM while the component lives, pinning the detached original. Back such fields with a `WeakRef` and a getter (`get el() { return elRef?.deref() ?? null }`). A diagnostic registry must never be a GC root for DOM or app objects; end-of-life cleanup does not cover mid-life replacement. Reference: `packages/core/runtime-dom/src/devtools.ts:registerComponent`; `tests/devtools-el-weakref.test.tsx`.

---

### Storing a native engine's collection on an `@Observable` class

An `@Observable` array is one tracked property, so a node move invalidates every view reading any node — O(N) per drag frame. Per-element `@Observable` boxes fix invalidation, but each read goes through the ObservationRegistrar (~2.6 µs), so engine loops that read boxes become ~100× slower. Keep engine state in `@ObservationIgnored` storage keyed by id, write each change to the store and to that node's box, expose one observable version counter for whole-collection readers, and never read boxes inside engine code. Compose's `mutableStateMapOf` is already per-key, so the Kotlin twin needs no boxes. Locked by the observation-granularity spec in `packages/fundamentals/flow/native/tests/PyreonFlowStateTests.swift`.

---

### Tearing down a per-key registry with one hashed `Map.delete` per key

N × (`Map.get` + `Map.delete`) is real cost on long lists, and in `createSelector.subscribe` it was a second registry duplicating the reconciler's own key map. Put each value behind a holder (`Map<K, {fn}>`) so unsubscribing is one field write, keep the identity guard (`h.fn === updater`, so a stale dispose cannot unsubscribe the key's new owner), `clear()` the map when the live count reaches 0, and reclaim dead holders on insert, not during teardown (a dispose-path trigger rebuilds the map repeatedly mid-teardown). Profiling notes: probe a path by making it cheap, not by no-oping it (a no-op teardown leaks and skews other frames); V8 inlines disposer chains, so read self-time as a tree; a GC test must watch the object actually retained (the keys, not the updaters). Reference: `packages/core/reactivity/src/createSelector.ts`; `tests/createSelector-bound-holder.test.ts`.

---

### Position-based pop for error-boundary stack frames

Sibling boundaries unmount in renderer order (keyed `<For>` removals, `<Show>` flips, route changes), so a `stack.pop()` in `onUnmount` removed another boundary's handler and later errors went to a disposed boundary and were swallowed. `popErrorBoundary(handler)` removes by identity (`lastIndexOf` + `splice`). Whenever code pushes at setup and pops at cleanup on a module-level array, ask whether removal can be out of order. Reference: `packages/core/core/src/{component.ts,error-boundary.ts}`; `packages/core/runtime-dom/src/tests/error-boundary-stack-leak-repro.test.tsx`.

---

### Position-based pop on SSR and compat context stacks

Client context is owner-based (`provide()` writes onto the component's `EffectScope`), so this does not apply to client `provide()`/`useContext()`. It does apply to the SSR request-scoped stack (`pushContext`/`popContext`) and the `*-compat` layers' own stacks: capture the pushed frame and remove it by identity with `removeContextFrame`. Reference: `packages/core/core/src/context.ts:removeContextFrame`; `packages/core/runtime-dom/src/tests/ctx-stack-growth-repro.test.tsx`.

---

### A per-view `dispose()` destroying a shared, cached resource

A view over a keyed/shared resource (a `WeakMap<Y.Doc, Awareness>`, a connection pool, a ref-counted singleton) must tear down only what it added. Pyreon calls `dispose` on unmount, so one component unmounting would kill the resource for the whole app. Ownership stays with whatever created or keys the resource: `syncedAwareness().dispose()` only detaches its listener, and the doc tears down awareness (`YjsCrdtDoc.destroy()` → `destroyDocAwareness`). Smell: a `dispose()` calling `.destroy()` or `.delete(key)` on something it looked up rather than allocated. Reference: `packages/fundamentals/sync/src/tests/awareness.test.ts`.

---

### A create-if-missing CRDT seed written before the transport syncs

A pre-sync default is concurrent with every unreceived peer op, and Yjs breaks `Y.Map` ties by random clientId, so a fresh peer's default can permanently overwrite a real value. It shows up in CI as a bimodal "timeout flake". `syncedSignal` seeds immediately only when there is no transport or it has synced; otherwise it waits for sync, re-checks `map.has(key)`, and seeds only if still absent, cancelably on dispose. `initial` is still shown locally. The doc owns the seam (`crdt/doc-sync.ts`: `registerDocTransport`, `docHasUnsyncedTransport`, `whenDocSynced`); `WebSocketTransport` exposes `synced` and `whenSynced()`. Limitation: two fresh peers seeding an empty room with different defaults still tie-break — gate app defaults on `await transport.whenSynced()`. Reference: `packages/fundamentals/sync/src/{synced-signal.ts,crdt/doc-sync.ts,crdt/yjs-ws-transport.ts}`; `tests/seed-deferral.test.ts` (asserts convergence on both clientId orderings).

---

### Calling `close()` before nulling a socket's handlers

`close()` only starts the closing handshake; a buffered frame can still reach an attached handler and write into a disposed scope. Null the handlers first, then call `close()` — assigning `null` to an event-handler attribute just detaches it and nothing throws. Same for `EventSource`. Enforced by `pyreon/no-close-before-handler-teardown`.

---

### `intentionalClose` reset on reactive dependency change

If a user explicitly calls `close()` on a WebSocket subscription and a reactive dependency (URL, enabled) changes, do not silently reconnect. Respect the explicit close unless `enabled` was explicitly provided and transitions to `true`.

---

### Silent plugin/init error swallowing

`catch (_err) { /* silent */ }` in plugin runners or async initialization hides bugs. Log in dev and call user-provided `onError` callbacks. Reference: `store/src/index.ts` (plugins), `storage/src/indexed-db.ts` (IndexedDB init).

---

### An async `_mount` that lazy-loads an engine, with `dispose()` gated on `view.peek()`

Between `await import(...)` and `view.set(editor)`, `view` is null. Three bugs live there: (1) `dispose()` no-ops and the engine created after the await leaks; (2) `void instance._mount(el)` turns a mount failure into an unhandled rejection and the editor silently never mounts; (3) re-mounting the same instance from the config-time content drops every edit. Fix in `_mount`/`dispose`: a `mountToken` generation counter captured before the awaits and checked after each (destroy an engine already built); `try/catch` routing to `onError` (dev `console.error` otherwise); seed a re-mount from the live document signal (`baseJson.peek()` / `value.peek()`). `<DiffEditor>` is per-render, so it uses an `unmounted` flag set in `onUnmount` and checked after the await. Reference: `packages/fundamentals/rich-text/src/editor.ts`, `packages/fundamentals/code/src/editor.ts`, `code/src/components/diff-editor.tsx`; specs in `rich-text.browser.test.tsx` and `code.browser.test.tsx`.

---

### Untracked `requestAnimationFrame` loops

An animation function that does not store its frame ID leaks frames when called again or disposed mid-animation. Store the ID, cancel the previous one before starting, and cancel in `dispose()`. Reference: `flow/src/flow.ts` (`_layoutFrameId`, `_viewportFrameId`).

---

### Bare `requestAnimationFrame` in async animation paths

An async path (`await computeLayout(...)`) can reach its rAF call after the test environment is torn down, throwing `ReferenceError: requestAnimationFrame is not defined` as an unhandled error that fails the run with all tests green. Wrap rAF/cAF in helpers that no-op when the global is not a function: `const _raf = (cb) => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : 0`. Applies to SSR and workers too. Reference: `flow/src/flow.ts` (`_raf`, `_caf`); `flow/src/tests/raf-teardown-safety.test.ts`.

---

### `Date.now()` + `Math.random()` for unique IDs

Under rapid operations (paste, clone), `Date.now()` repeats within a millisecond and `Math.random().toString(36).slice(2, 6)` has only ~1.67M values. Use a monotonic counter. Reference: `flow/src/flow.ts` (`_pasteCounter`).

**Detected by:** `date-math-random-id` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### Raw `addEventListener` / `removeEventListener` in component or hook bodies

Bypasses lifecycle cleanup, so listeners leak on unmount. Use `useEventListener` from `@pyreon/hooks`. The detector only flags bare `window` / `document` / common DOM identifiers (`el`, `element`, `node`, `target`), so host chains like `view.dom.ownerDocument.addEventListener(...)` are left alone.

**Detected by:** `raw-add-event-listener` · `raw-remove-event-listener` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### `effect()` doing imperative work at component setup

[`pyreon/no-imperative-effect-on-create`]: `effect(() => fetch(...))`, `effect(() => document.addEventListener(...))`, `effect(() => setTimeout(...))` run synchronously during setup, per instance, and accumulate across many instances. `effect()` is for reactive subscriptions (signal reads and writes); put DOM, IO and scheduling in `onMount`. The rule flags `fetch` / `setTimeout` / `setInterval` / `requestAnimationFrame` / `requestIdleCallback` / `queueMicrotask` calls and `document.X` / `window.X` / `localStorage.X` / `sessionStorage.X` access inside effect bodies. `@pyreon/hooks` and `@pyreon/rx` are exempted via `exemptPaths`, since they are the layer that wraps timers and listeners.

---

### Static import of a heavy module used only in handlers

[`pyreon/no-heavy-import-only-in-handler`]: `import { renderChart } from '@pyreon/charts'` used only inside `onClick` or an `onMount`/`onUnmount`/`onCleanup` callback puts the chunk in the initial bundle. Use `await import('@pyreon/charts')` inside the handler. Unlike `pyreon/no-eager-import` (info, every heavy import), this rule fires only when every reference is in a deferred scope; one eager reference suppresses it. `effect`/`renderEffect` bodies are not deferred scopes (they run during setup). The heavy set defaults to `@pyreon/charts|code|flow|document` and extends via `heavyModules`. Run a new lint rule against the real example corpus before merging; synthetic specs miss scope semantics. Reference: `packages/tools/lint/src/rules/performance/no-heavy-import-only-in-handler.ts`.

---

### Closure-captured `parent` in a reactive mount loop

`mountFor` builds children in a `DocumentFragment` and moves it into the live parent, carrying markers along, but an inner mount's closure still holds the empty fragment as `parent`. The next re-run's `parent.insertBefore(node, marker)` throws `NotFoundError` and the subtree is lost. Any mount loop inside an effect must read `marker.parentNode` (or `tailMarker.parentNode`) on each run and thread that live parent through every helper that inserts, falling back to the captured `parent` only when the marker is detached. Fixed in `mountReactive` and `mountKeyedList` (`mountNewEntries`, `mountVNode`, `keyedListReorder` → `applyKeyedMoves` → `moveEntryBefore`); `mountFor` uses `startMarker.parentNode`, and `KeepAlive`/`TransitionGroup`/`Transition` use live element refs. Reference: `packages/core/runtime-dom/src/nodes.ts`; `tests/keyed-array-in-for-batched-toggle.browser.test.ts`, `tests/show-of-for-batched-toggle.browser.test.ts`; `bun run perf:leak-sweep --app perf-dashboard --journeys domConditionalToggle-1000`.

---

### Reactive-render entry points missing `runUntracked` around child mounts

A primitive whose effect body mounts children (`mountFor`, `mountKeyedList`, `KeepAlive`, `TransitionGroup`) must wrap that work in `runUntracked(() => ...)`, as `mountReactive` does. Otherwise signal reads in a child's setup subscribe the parent effect; when that signal flips, the parent re-runs, disposes every child effect, and skips re-mounting unchanged keys, so child reactivity is gone. Reference: `packages/core/runtime-dom/src/{nodes.ts,keep-alive.ts,transition-group.ts}`; `tests/fanout-repro.test.tsx`.

---

### Recording a new row's logical index as its position before a position-based reorder

`mountFor`'s LIS reconciler treats `ForEntry.pos` as the current DOM position, but new entries are mounted at the tail. Recording their logical index made a row between two survivors look already in order, so `[1,2,3,4] → [1,5,3]` rendered `[1,3,5]` (LIS path only, taken on length changes when `trySmallKReorder` bails). `mountNewForEntries` gives a new entry with a survivor after it a sentinel `pos` of -1, which `computeForLis` skips and `applyForMoves` threads before its successor; the trailing all-new run gets increasing `pos` above every survivor so append does zero moves. Assigning a high `pos` to every new entry is correct but pushes prepend into binary-search probes, which the `@pyreon/perf-harness` `big-list` counter lock catches — run both `@pyreon/runtime-dom` and `@pyreon/perf-harness` tests after reconciler changes. A reorder must never be fed a position that lies about what it assumes. Reference: `packages/core/runtime-dom/src/nodes.ts` (`mountNewForEntries`, `computeForLis`); `tests/for-add-into-vacated-slot.test.tsx`, `packages/internals/perf-harness/src/tests/big-list.test.ts`.

---

### Re-entrant signal write inside an effect's own flush

An effect that writes a signal it depends on must re-fire on the next pass. The batch flush in `packages/core/reactivity/src/batch.ts` has two tiers: tier 1 (`recomputeQueue`) settles computeds, marked via `_markRecompute`, before any effect runs; tier 2 runs effects in passes (`curEffects`, then `nextEffects`), so an already-run effect is re-queued for the next pass. `MAX_PASSES` caps effect passes at 32. `ErrorBoundary`'s handler relies on this: it calls `error.set(err)` synchronously and the boundary re-renders with its fallback on the next pass.

---

### An "already running" flag checked before the await that acquires a resource

A hook that checks `if (active()) return`, awaits a permission or device, then sets the flag lets concurrent calls each acquire a resource and orphan the first (`useWakeLock` sentinel, `useAudioRecorder` microphone stream, `useDeviceMotion` listener). The window lasts as long as the permission prompt. Share the in-flight promise (`if (starting) return starting`), and after the await re-check a generation counter that every teardown bumps (unmount, `release()`/`stop()`, a superseding call) and release what you just acquired if you lost. Test state after unmount (released sentinel, stopped tracks), not listener call counts. `pyreon/no-unguarded-async-signal-write` accepts an in-flight promise as a guard, including one in an enclosing scope.

---

### A settle-once flag does not cover settle-never

The file pickers (`useCamera`, `useFilePicker`, `useImagePicker`) append a hidden `<input type="file">` and remove it in `settle`. If neither `change` nor `cancel` fires (older browsers, or unmount while the OS sheet is open), the node, its listeners and the `resolve` closure are retained forever and the promise never settles. A resource acquired from an event handler has no reactive scope to own it, so the hook registers `onCleanup` during setup and settles whatever is still in flight. Check that a guard actually implements the invariant its comment claims. Reference: `packages/fundamentals/hooks/src/file-picker.ts`; `hooks/src/tests/file-picker-unmount.test.ts`.

---

### A module-scoped store reached on the server

A module-level `Map` is correctly app-wide in a browser, where one process serves one user, but on a server it is shared by every request. `useDatabase` and `useSecureStorage` returned one request's records and secrets to another under SSR. Their server arms are now inert (consistent within a render, nothing carried across requests). Before reusing a module-scoped cache on the server, ask what one process means there. A `/* v8 ignore */` claiming a branch is untestable, while sibling files test the same shape, signals an unexamined branch. Reference: `packages/fundamentals/hooks/src/{useDatabase,useSecureStorage}.ts`; `hooks/src/tests/server-store-isolation.ssr.test.ts`.

---

### An opt-in seam only the application author can call

`configureStoreIsolation(setter)` swaps `@pyreon/store`'s registry for an AsyncLocalStorage-backed one, but neither `@pyreon/server` nor `@pyreon/zero` depends on the store, so by default nothing called it and concurrent SSR requests shared store state. If a seam's shape means no framework layer can call it, its default is production behaviour, and a cross-user data property needs a safe default. The store now publishes its setter on `globalThis.__PYREON_STORE_SET_REGISTRY_PROVIDER__` at module load (server-gated) and `@pyreon/runtime-server` picks it up lazily per render (`tryAutoWireRegistryIsolation`); `configureStoreIsolation` remains the explicit override. The pickup must be lazy (the renderer may load before the app imports the store), and the publishing file must be listed in `sideEffects`. Reference: `packages/fundamentals/store/src/registry.ts`, `packages/core/runtime-server/src/index.ts`; `store/src/tests/registry-seam.ssr.test.ts`, `runtime-server/src/tests/store-isolation-autowire.test.ts`.

---

### PMTC: unmapped member calls falling through to a verbatim emit

Both emitters dispatch member calls through a `switch (prop)` with no `default:`, so an unmapped method (`xs.toSorted()`) was re-emitted verbatim and failed swiftc/kotlinc with no warning, in statement and expression position alike (one emitter serves both). A blanket fallthrough warning is wrong because many methods (`map`, `filter`, `reduce`, `split`, `padStart`, …) compile unchanged. The gate is an explicit set of JS array/string methods with no lowering (`UNMAPPED_ARRAY_METHODS`, `UNMAPPED_STRING_METHODS`), checked only against a provably array or string receiver. A mapped method whose shape does not match can still break out of its case, so `xs.sort()` warns inside its own case (`unloweredSortWarning`). `codePointAt` is in the set even though Kotlin compiles it: Java's version throws out of bounds where JS returns `undefined`. Reference: `packages/native/compiler/src/unlowered-props.ts`; `native-emit-correctness.test.ts`, `closed-set-totality.test.ts` (no set member has a `case`), `native-idiom-sweep.test.ts`.

---

### PMTC: a same-named native primitive with a narrower or different contract

A lowering inherits the native primitive's rounding, units, locale and nullability, and the result compiles and silently differs on one target. Look up the primitive's contract; do not infer from the name.
  - `Math.round`: Swift `.rounded()` rounds ties away from zero; JS rounds ties toward +∞. Swift emits `((Double(x)) + 0.5).rounded(.down)`. Kotlin's `java.lang.Math.round` is specified as `floor(x + 0.5)` and already matches.
  - `String.length`: Swift `String.count` counts grapheme clusters (`"👍"` is 1, JS/Kotlin say 2). Emit `.utf16.count` for a provably string receiver; an array keeps `.count`.
  - `toFixed`: Kotlin's 1-arg `"%.2f".format(x)` uses the device locale (`1234,57` under German). Emit `"%.2f".format(java.util.Locale.ROOT, x)`. Swift's `String(format:)` is already invariant.
  - `Record<K, V>` index: native dictionary subscripts are optional on both targets; this is inherent to the lowering.
  When a correction lands at one call site, apply the invariant everywhere it holds. Reference: `emit-swift.ts`, `emit-kotlin.ts`; `native-emit-correctness.test.ts`.

---

### Treating every function-valued prop as an event handler (`@pyreon/atlas`)

Discovery marks any callback prop `reactive`, and the generated catalog injected a logger for each, including optional `children` and `renderItem`. `Combobox` then took its render-prop path, got `undefined`, and every preview rendered empty with no error. Instrument only props matching the event contract `/^on[A-Z]/`, and never synthesize an absent callback. Assert both halves (`onSelect` instrumented, `children`/`renderItem` absent) and prove the mount in a browser. Navigation tests must also assert zero `pageerror` events. Keep an object meant to retain identity (`props.model`) in a `let`, which prop-derived inlining skips. Reference: `packages/tools/atlas/src/dev/catalog-module.ts`, `packages/tools/atlas/src/ui/views/docs/DocsView.tsx`, `catalog-module.test.ts`.

---

### Generated scenarios with no content, and a preview gate that passes on an empty element (`@pyreon/atlas`)

Scenarios derived from props and dimension axes mounted `h(Button, { state, size })` with no children, `src` or `placeholder`, so every component rendered as an empty shell while the scan reported everything verified. Derive content from what the component renders as — the tag from the rocketstyle attrs chain (`__rs_attrs`, `__rs_component`): text tags get the component name, `<img>` a local placeholder `src` + `alt`, fields a `placeholder`, layout containers placeholder blocks, `<hr>` nothing. Authored args always win. One `materializeContent` turns content into vnodes for the mount harness, the SSR-parity check and the generated workbench. A "renders" assertion must measure area or text, not child count. Limitations found alongside: `createUniqueId()` is a process-wide counter that nothing resets per request (`_resetIdCounter` has no caller), so SSR, hydrate and client mount mint different ids and a later `aria-controls` can point at the wrong id; a static a11y check gated on required props skips rocketstyle components, so it also checks name-like props the scenario supplies; and `applyProps`' getter branch must resolve a function value inside the tracked frame, as `applyProp` does. Reference: `packages/tools/atlas/src/core/content.ts`, `discover/rocketstyle.ts:readTag`, `plugins/content.ts`; `core/tests/content.test.ts`, `plugins/tests/{mount,ssr-parity,content}.test.ts`, root `e2e/atlas-build.spec.ts`.

---
