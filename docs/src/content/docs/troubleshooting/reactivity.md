---
title: "Reactivity Mistakes"
description: "Common reactivity mistakes in Pyreon and how to fix them."
---

# Reactivity Mistakes

> **Generated** from `.agents/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### Bare signal in JSX text

`{count()}` → wrap in `{() => count()}` or let the compiler handle it.

---

### Resetting module-level frame state to a constant instead of restoring it

Tracking collectors, owners and the lifecycle frame nest, so frame exit must restore the value captured at entry, never reset to `null`.
  - Reset-to-null at depth 2 silently drops work: a nested `effect()` dropped the outer effect's later `onCleanup()` calls; a computed's first eval inside an effect left the effect's later reads subscribed but unrecorded (retained after `dispose()`); `runWithHooks` dropped every `onMount`/`onUnmount`/`onUpdate`/`onErrorCaptured` registered after a nested child mount.
  - Nesting is not visible in the calling code: `_tpl(html, bindFn)` runs `bindFn` synchronously, so `const box = <div>{show && <Child/>}</div>` runs `Child`'s whole setup inside the parent's.
  - Use the `tracking.ts` frame helpers (`runCollect` / `runVerify`); `runWithHooks` saves `getCurrentHooks()` and restores it (`packages/core/core/src/component.ts`).
  - Tests: `reactivity/src/tests/verify-deps.test.ts` ("frame-restore regressions"), `core/src/tests/lifecycle-frame.test.ts`, `runtime-dom/src/tests/nested-setup-hooks-frame.test.tsx` (compiled through the real `transformJSX`; vitest's JSX transform never emits `_tpl`).

---

### Dispatching a computed's direct subscribers during an inline recompute

An inline write-time recompute may mark dirty and propagate, but direct (`_d1`/`_d`) subscribers must fire in the batch drain.
  - Inside `batch(() => { a.set(); b.set() })` the value is torn between writes, so an inline dispatch fires on half-updated values (`[12, 30]` instead of `[30]`) and a torn eval that throws reports a phantom error.
  - `computed.ts:propagateEagerChange` defers the dispatch via `enqueuePendingNotification`; the `_dirty` guard keeps it idempotent.
  - The write-time dirty cascade must stay depth-bounded: `batch.ts` recurses while `_cascadeDepth` is below `MAX_CASCADE_RECURSION`, then switches to an explicit stack. An overflow caught downstream would otherwise clear `_dirty` with a stale value (a silent lost update).
  - Test: `reactivity/src/tests/batch-glitch-freedom.test.ts` (includes a 10,001-deep chain).

---

### Trusting a pulled dep's cache during a subscription-order drain

Tier-1 drains in subscription order, not topological order, so a queued evaluator must never read a dep that was queued but not marked dirty.
  - Dirty-mark every computed inline during the write's notify phase, so a pull-read evaluates a dirty dep in place.
  - Clear an entry's queue-membership flag before running it, so a re-notify after its visit re-queues it instead of being deduped away. A DAG settles in at most depth sweeps.
  - The old direct inline eager path was faster because it was wrong (torn and stale); do not chase that speed.
  - Code: `computed.ts:createComputed` (the read's dirty branch is the single evaluator) + `batch.ts` (`enqueueEagerRefresh`, `recomputeQueue`). Test: `reactivity/src/tests/tier1-topo-staleness.test.ts`.

---

### Stale closures

`signal.peek()` captured in long-lived closures loses reactivity.

---

### An effect that reads a counter it also writes

The write re-queues the effect, and the batch re-runs it up to `MAX_PASSES` (32) times before dropping it with only a generic MAX_PASSES console warning.
  - Write a counter that exists for other readers with `.peek()`: `version.set(version.peek() + 1)`.
  - The symptom may not look like a loop: in `packages/fundamentals/charts/src/engine/canvas-host.tsx` each re-run called `draw()`, which cancelled the tween the first run started, so the animation snapped.

---

### Missing batch

3+ signal updates without `batch()` → unnecessary re-renders.

---

### Nested effects

`effect()` inside `effect()` → use `computed()` for derived values.

---

### Signals in hot paths

Creating signals inside render functions or loops → create once at component setup.

---

### Reading `.peek()` in effects/computeds

Bypasses tracking, creates stale reads.

---

### One version counter for both content and selection events

When wrapping an imperative engine (ProseMirror/TipTap, CodeMirror) in signals, a single counter bumped by both update and selection events re-evaluates every content computed on each cursor move.
  - Split by event: `docVersion` (content) and `selectionVersion`; content computeds read only `docVersion`.
  - Better: derive content values from the document signal, not the engine. `@pyreon/rich-text`'s `characterCount`/`wordCount`/`isEmpty` walk the `baseJson` signal, so they work before mount too.
  - Code: `packages/fundamentals/rich-text/src/editor.ts`. Tests: `rich-text.browser.test.tsx` ("a pure selection move does NOT re-run content computeds"), `rich-text.test.ts`.

---

### Ternary short-circuit hides a signal read

In `{() => touched() ? error() ?? '' : ''}`, `error()` is never read while `touched` is false, so the accessor never subscribes to it.
  - If the validator sets `error` in the same batch that flips `touched`, the error never renders. Same for `cond && sig()`.
  - Fix: read both first: `{() => { const t = touched(); const e = error(); return t ? e ?? '' : '' }}`.
  - This is normal fine-grained reactivity (Solid, Preact signals, MobX behave the same). Not statically detectable without false positives. See `docs/src/content/docs/reactivity-rules.md` "Conditional Reads Hide Tracking".

---

### Dropping a schema error whose key matches no field

Code that maps a validator's keyed errors onto a fixed field set must route unmatched keys, never drop them. "Matched no field" means invalid.
  - Adapters flatten nested issues to dot-path keys (`"address.city"`) and whole-form errors to `""`.
  - `packages/fundamentals/form/src/use-form.ts`: `matchSchemaErrorForField(schemaErrors, name, fieldNames)` routes to the most specific registered field (an exact leaf field wins over its ancestor object field); `orphanSchemaErrorKeys` marks leftover keys as a form-level `submitError`. Both the submit `validate()` and blur paths use them.
  - Orphan detection must use the same match logic as routing (exact field, `nearestAncestorField`), or it flags already-routed leaf errors.
  - A declarative schema (Standard Schema or `@pyreon/validation` adapter) over a form with dot-path fields receives the nested value shape (`getSchemaInput` via `nestValues`); a plain `SchemaValidateFn` always gets the flat values.
  - `values()`/`onSubmit` stay flat (dot-path keys); `nestValues`/`flattenValues` convert. Limitation: types are flat, so a nested declarative schema needs an `as never` cast.
  - Tests: `form/src/tests/schema-error-routing.test.tsx`, `nested-paths.test.tsx`, `nested-schema-split.test.tsx`, `path.test.ts` (includes a `__proto__` pollution guard).

---

### Accessor interpolated UNCALLED in a template literal

`` `${itemWidth}%` `` with `itemWidth = computed(...)` renders the function source. The compiler's auto-call covers JSX only, not template literals.
  - Fix: `` `${itemWidth()}%` ``, built inside a tracking scope if it must update.
  - The detector fires only on tracked bindings (`signal`/`computed`, or a `useX()` result the file also calls as `x()`); it skips tagged templates (`css`/`styled` take functions) and names re-declared by a non-accessor binding.

**Detected by:** `accessor-uncalled-in-template` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### Accessor used BARE as an `if`/ternary condition (outside JSX)

A function is always truthy, so `if (!has)` is dead code.
  - Fix: `if (!has())`. The component body runs once, so render-time branching belongs in `<Show when={() => has()}>` or a returned accessor.
  - Inside JSX the compiler auto-calls known signals, so the detector fires outside JSX only. It skips nullable hook results (`if (!router)`), `typeof x === 'function'`, `x == null`, property access, and statements that also call the name.

**Detected by:** `accessor-uncalled-in-condition` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### Destructuring props

(parameter shape) `[detector: props-destructured-body]` (body shape): `({ state }) => …` or `const { state } = props` reads the prop getters once, so the locals never update.
  - Use `props.state` inside a reactive scope, or `splitProps(props, ['state'])`.
  - `detectPropsDestructured` / `detectPropsDestructuredBody` in `packages/core/compiler/src/pyreon-intercept.ts`. The body detector covers PascalCase components and a returned `(props) => …` HOC arrow (`isReturnedPropsComponent`); it only flags `= props` at the component body's top scope (nested functions re-read `props` and are fine).
  - Not flagged: `const { x } = props.nested`, destructuring another object, destructuring inside `onMount`. The Reactivity Lens (`analyzeReactivity`, LSP inlay hints via `@pyreon/lint --lsp`) shows `static` on such reads.

**Detected by:** `props-destructured` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### JSX spread on a component copies getter props by value

An object spread fires every getter, so `<Comp {...source}>` would freeze reactive props.
  - The compiler emits `<Comp {..._wrapSpread(source)}>` (`compiler/src/jsx.ts:handleJsxSpreadAttribute` + `native/src/lib.rs:handle_jsx_spread_attribute`). `_wrapSpread` (`core/src/props.ts`) re-brands getters as `_rp` thunks via `Reflect.ownKeys`; getter-free sources pass through unchanged. DOM-element spreads use `_applyProps` instead.
  - Framework packages are not compiled by Pyreon's compiler, so a JSX spread there is a plain object spread; use `h(Comp, mergeProps(a, b))`.

---

### Wrappers that copy props by value

`result[key] = source[key]`, `{...a, ...b}`, `Object.assign` and rest-destructuring all fire getters and freeze reactive props.
  - Copy descriptors: use `mergeProps` / `splitProps` / `removeUndefinedProps` from `@pyreon/core`, or `Object.getOwnPropertyDescriptors` + `Object.defineProperty`. Never hand-roll a copy loop.
  - Write companion keys (`ref`, overrides) with `Object.defineProperty`; plain assignment to a getter-only key is a no-op (sloppy) or throws (strict).
  - Fixed instances: `rocketstyle` (`utils/attrs.ts`), `styler/src/forward.ts:buildProps`, `ui-core/src/utils.ts:omit`/`pick`, `kinetic/src/kinetic/createKineticComponent.tsx` (`splitProps` with `KINETIC_KEYS`; renderers pass `mergeProps(htmlProps, { ref, style })`). Test: `kinetic/src/__tests__/kinetic.browser.test.tsx`.
  - The same freeze hides in other shapes (fixed in `@pyreon/elements`): body/parameter destructures; render-prop objects built with eager reads (pass `_rp(() => active())` so `aria-expanded` stays live without re-rendering the trigger); styling bundles computed at setup (`elements/src/utils.ts:hasGetterProps` switches to an accessor bundle that `styler/src/styled.tsx` treats as a reactive axis, bypassing class caches and CPSE via `isReactiveEl`/`bypassElCacheAndCpse`); slot-existence checks at setup (run the body in an accessor when slots are getters).
  - A reactive list body must not return fully keyed vnode arrays built from plain props: `mountKeyedList` never re-renders surviving keys, so the rows freeze.
  - Tests: `elements/src/__tests__/reactive-prop-class.test.tsx`, `reactive-prop-class-sweep.browser.test.tsx`.

---

### Fixing one frozen prop when every prop has the same shape

`_rp` is not prop-specific, so when one setup-read prop freezes, audit every prop read off the same holder.
  - Separate live from tracked. In `@pyreon/kinetic`, `show` is the state machine's input and is read tracked (`showAccessorFrom`); every other prop is read live but untracked (`readLive` / `readCallbacks` / `readLiveValue` in `kinetic/src/live-prop.ts`). `watch(source, cb)` runs `cb` inside the effect's tracking scope, so a tracked config read would restart the animation whenever an easing string changes.
  - `readLive` must not auto-call functions: a callback prop's value is a function.
  - Decide per prop and comment the reason at the site: `appear` is a first-mount question; a stagger `interval` is baked into resolved child styles and stays a plain read.
  - Tests: `kinetic/src/__tests__/live-props.test.tsx`, `kinetic.browser.test.tsx`.

---

### Resolving a `children ?? content ?? label` fallback at setup

The `??` fires each getter once, so `<Text label={sig()} />` never updates.
  - Pass an accessor: `children: () => own.children ?? own.content ?? own.label`.
  - A JSX-child accessor (`<Comp>{sig()}</Comp>`) is unaffected; this is about getter-valued props.
  - A unit test asserting `result.props.children` equals the resolved value encodes the broken shape; assert `props.children()` and flip the signal in a real mount.
  - Code: `elements/src/Text/component.tsx` (matches `Element/component.tsx:getChildren`). Test: `elements/src/__tests__/reactive-prop-through-element.browser.test.tsx`.

---

### Checking subscribers by reading `_d` or `_s` alone

Both subscriber channels are tiered, so a one-field presence check misses single-subscriber signals.
  - Direct channel: `_d1` (inline) then `_d` (Set). Tracking channel: `_s1` (inline), then `_s` holding a second inline subscriber as a function, then a Set in `_s` (with `_s1 === null`) for 3+.
  - Use `_hasSubscribers(sig)` / `_tierCount` from `@pyreon/reactivity`; inside reactivity use `addSubscriber` / `removeSubscriber` from `tracking.ts`. Never call `.size`/`.delete`/iterate on `_s` directly.
  - `addSubscriber` must stay idempotent, and code adding to the tiers must promote inline occupants first, or a subscriber is stranded. `@pyreon/store` wires field detectors on the first `api.subscribe()`, after components already tracked the field (test: `store/src/tests/subscribe-after-tracked-read.test.ts`).
  - Fixed readers: `solid-compat`'s `sweepUnusedSignals`, the devtools graph, `createSelector`'s sweep.

---

### Component props on the direct subscriber tier

`<Row value={sig()} />` read as `{props.value}` binds without a tracking effect.
  - The compiler lowers a bare signal/computed call prop to `_rpd(sig)` (a `REACTIVE_PROP` thunk carrying `.direct`/`._v`/`.peek`) and a template text child reading a prop to `_bindProp(props, "value", node, parent)`, which takes `_bindText`'s direct tier when the getter has `.direct`, else the tracked path.
  - Only the exact bare call qualifies; `sig() + 1`, `String(sig())`, a shadowed name keep `_rp`, and `props.a.b` keeps `bindPolymorphicText`.
  - Limitation: `const props = mergeProps(p, …)` is a plain local to the classifier, so `{props.value}` is static and never updates.
  - Tests: `compiler/src/tests/reactive-prop-direct-tier-emit.test.ts`, `runtime-dom/src/tests/reactive-prop-direct-tier.test.tsx`.

---

### Storing `() => sig()` instead of the signal

`_bindText`/`_bindDirect` use the O(1) direct tier only when the source has `.direct` (a signal or computed). A bare arrow falls back to a `renderEffect` with dep verification and a hashed `Set.delete` on teardown.
  - Store the signal, or a `computed(() => …)` for derived values.
  - This is about what a field holds: `value={sig}` is auto-called to `_rp(() => sig())` (the prop carries the value), while `value={row.value}` forwards whatever the field holds. Check with `transformJSX`. Probe: `examples/benchmark/probe-disposecensus.ts`.

---

### Signal-like wrapper callables missing the internal `_v` field

(enforced by `pyreon/storage-signal-v-forwarding`): `_bindText`/`_bindDirect` read `source._v` directly, so a wrapper that forwards `.direct`/`.peek`/`.subscribe` but not `_v` renders `''` forever.
  - Use `wrapSignal(base, { set })` from `@pyreon/reactivity`; it forwards `_v`, `.direct`, `.peek`, `.subscribe`, `.label`. `@pyreon/storage` (`createStorageSignal`) and `@pyreon/state-tree` (`trackedSignal`) use it.
  - Calling `wrapper()` in a unit test does not exercise the fast path. Test: `state-tree/src/tests/tracked-signal-bind-contract.test.ts`.

---

### Re-reading tiered subscriber storage after dispatching

A dispatched subscriber can add a third subscriber, promoting the inline slots into a Set, so an identity check against the inline slots skips a live subscriber.
  - Snapshot the subscribers, then ask "still subscribed?" with a predicate covering every shape (`createSelector.ts:isSubscribed`, whose `typeof s !== 'function'` discriminator mirrors `removeSubscriber`).
  - `signal.ts`'s `_set`/`_trigger` and `batch.ts:propagateLazyDirty` never re-read, so they are safe. Test: `reactivity/src/tests/createSelector-tier-promotion.test.ts`.

---

### Normalizing a prop to an accessor at setup

`toAccessor(props.show)` reads the getter once and wraps a frozen value.
  - Read inside the returned accessor from the live holder: `() => normalize(holder.x)`, as `<Show>` does with `callWhen(props.when)`. A helper that takes `props.x` instead of `props` has already lost the getter.
  - `show={isOpen}` lowers to an `_rp` getter; tests that only pass `show={() => sig()}` cannot see this. Test with an `_rp`-branded prop plus the accessor form as control.
  - Code: `kinetic/src/show-accessor.ts:showAccessorFrom`. Tests: `kinetic/src/__tests__/show-reactive-prop.test.tsx`, `kinetic.browser.test.tsx`.

---

### A sync effect that writes with `setX((prev) => …)`

The updater reads the library's own atom, so the effect subscribes to what it writes and re-runs forever. Track only your own inputs (`options()`) and wrap the library write in `untrack`.

---

### Partially untracked per-item lookups

Every navigation step in a reactive library (`getRowModel()`, `getVisibleCells()`, `getContext()`) is an atom read. If the per-item signal should be the only subscription, untrack the whole lookup, not just the first call.

---

### Comparing user collections by array identity

Call sites inline literals (`columns: [...]`), so identity changes on every sync and everything invalidates. Compare a cheap structural signature.

---

### "Nothing changed → invalidate everything" fallbacks

Such effects re-run more than once per change as atoms settle, and later passes see advanced baselines. Invalidate only on a detected change; a re-run that detects nothing does nothing.

---

### Not matching the reference bindings' default compare

Read the reference bindings' defaults (compare, laziness, scheduling) and match them.
  - TanStack Store's `createAtom` defaults `compare` to `Object.is`; the adapter passes `computed(fn, { equals: options?.compare ?? Object.is })`. Without it, every options write re-notified every slice subscriber with an unchanged value.
  - Per-row cell lists go through the fine-grained `visibleCells` accessor (row signal + column-geometry slices, lookup untracked); a tracked `each={() => row.getVisibleCells()}` re-runs every row on a single-cell edit.
  - Count re-runs of the loop accessor, not only cells. Tests: `table/src/tests/reactivity.test.ts`, `fine-grained-cell.test.tsx`.

---

### Keeping hand-rolled machinery after adopting the seam

When a dependency gains a reactivity seam, delete the workarounds it replaces (the table adapter dropped its version counter, whole-state diff and `onStateChange` interception).

---
