---
title: "Reactivity Mistakes"
description: "Common reactivity mistakes in Pyreon and how to fix them."
---

# Reactivity Mistakes

> **Generated** from `.claude/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### Bare signal in JSX text

`{count()}` → wrap in `{() => count()}` or let the compiler handle it

---

### Stale closures

`signal.peek()` captured in long-lived closures loses reactivity

---

### Missing batch

3+ signal updates without `batch()` → unnecessary re-renders

---

### Nested effects

`effect()` inside `effect()` → use `computed()` for derived values

---

### Signals in hot paths

Creating signals inside render functions or loops → create once at component setup

---

### Reading `.peek()` in effects/computeds

Bypasses tracking, creates stale reads

---

### Ternary short-circuit hiding signal tracking inside a reactive accessor

`{() => fields.title.touched() ? fields.title.error() ?? '' : ''}` is a quietly broken pattern. When `touched` is `false` on first render the ternary short-circuits → `error()` is NEVER read → the effect doesn't subscribe to it → a later `error.set('...')` doesn't trigger re-render. The accessor re-runs when `touched` flips, but the validator that flipped it may set the error in the SAME batch — at re-run time `error()` is still `undefined`, and now the effect subscribes only to the current value (`undefined`), not future ones. Same for `cond && sig()`. **Fix**: read both signals into a `const` BEFORE the conditional, so the effect subscribes to both on first render: `{() => { const t = fields.title.touched(); const e = fields.title.error(); return t ? e ?? '' : '' }}`. This is fundamental fine-grained reactivity (matches Solid / Preact-signals / MobX) — not a Pyreon-specific bug. Real-world hit: HN-clone audit #942 W11 — form field-errors stayed empty after submit even though the schema validator correctly set them. Documented in `docs/src/content/docs/reactivity-rules.md` "Conditional Reads Hide Tracking". Hard to detect statically with high precision (any conditional with a signal call in one branch is suspect, but false-positive risk is high — many such expressions ARE correct by construction because both signals come from a shared upstream).

---

### Signal/computed used UNCALLED in a conditional (always-truthy)

`{isEven ? 'a' : 'b'}` / `{show && <X/>}` / `open || fallback` / `!open` / `if (loading)` where the identifier is a `signal()`/`computed()` reads the FUNCTION, not its value — a function is always truthy and never nullish, so the branch is decided ONCE by the function's identity, the reactive read never subscribes, and a later `.set()` never re-evaluates the condition. The compiler auto-calls a bare `{sig}` JSX CHILD, but NOT a `sig` inside a ternary / `&&` / `||` / `??` / `!` / `if`, so this exact shape slips through typecheck AND the SSG build to runtime. It was the real create-zero `counter.tsx` bug (`{isEven ? "true" : "false"}` rendered "true" forever), and the 2026-07 compiler-fuzz campaign independently surfaced the same class (`title={sig ? "a" : "b"}` "stuck forever … bare signal fn is always truthy"). **Fix**: call it — `{isEven() ? 'a' : 'b'}`. **This is DISTINCT from the "Ternary short-circuit hiding signal tracking" entry above**: there BOTH signals are CALLED but a branch isn't read on first render (a subscription-timing bug the author flags as "hard to detect statically"); HERE the signal is UNCALLED in the CONDITION (always-truthy), which IS precisely detectable. Statically caught by the TS-compiler-API detector `detectSignalInConditionalUncalled` — scope-resolved (`resolvesToSignalBinding`) so a boolean parameter or local that merely SHARES a signal's name is NOT flagged (the zero-false-positive requirement for a conditional-position warning; validated at 0 hits across all `packages` + `examples` + `docs`). The mechanical auto-fix (append `()`) ships in the companion `@pyreon/lint` rule, not `migratePyreonCode`. Reference: `packages/core/compiler/src/pyreon-intercept.ts:detectSignalInConditionalUncalled`.

**Detected by:** `signal-in-conditional-uncalled` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### Destructuring props

(parameter shape) `[detector: props-destructured-body]` (body shape): `const { state } = props` (or `({ state }) => …`) captures getter values once — loses reactivity. The compiler emits signal-driven props as getters, so the destructured locals are dead snapshots that never update when the parent rewrites them. Use `props.state` directly inside the reactive scope (JSX / effect / computed), or `splitProps(props, ['state'])` to carve out a group while preserving reactivity. **Both shapes are now statically caught** by `detectPyreonPatterns` (the TS-compiler-API detector — full AST + scope, NOT the lightweight oxc lint walker the prior "doc-only cliff" note referred to): `detectPropsDestructured` flags the parameter-destructure shape `function C({ state }){…}`; `detectPropsDestructuredBody` flags the body-scope shape `const { state } = props` written SYNCHRONOUSLY in a component body. **Body-scope precision** (zero false positives is the priority): only PascalCase JSX-rendering functions; only `= props` where `props` is the bare first-parameter identifier (unwrapped through `as` / `satisfies` / `!` / parens); the destructure must be at the component-body top scope — a nested-function boundary (`onClick` handler, `effect(() => …)`, a returned reactive accessor) re-reads `props` per invocation and is reactivity-correct, so the walk does NOT descend into nested functions. **Known limitations** (deliberate, conservative): `const { x } = props.nested` and `= someOtherObject` are NOT flagged (rarer shapes); a `const { x } = props` inside `onMount(() => …)` is not flagged (different/rarer shape — runs once post-mount). The **Reactivity Lens** (`analyzeReactivity` in `@pyreon/compiler`; LSP inlay hints via `@pyreon/lint --lsp`) complements the detector downstream: it renders `static` ghost-text on `<div>{state}</div>` when the compiler proves that expression is NOT reactive — making the captured-once death visible at the cursor even for the limitation shapes the detector deliberately doesn't name.

**Detected by:** `props-destructured` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### JSX spread on a component value-copies getter-shaped reactive props

(compiler-fixed end-to-end as of 2026-05-14): esbuild's automatic JSX runtime compiles `<Comp {...source}>` to `jsx(Comp, { ...source })`. The JS-level object spread fires every getter on `source` and stores resolved values — collapsing compiler-emitted reactive props (`_rp(() => signal())` wrappers converted to getters by `makeReactiveProps`) to static values before `Comp` ever sees them. **Fix lives in the Pyreon compiler** (both JS path in `packages/core/compiler/src/jsx.ts:handleJsxSpreadAttribute` AND Rust binary in `packages/core/compiler/native/src/lib.rs:handle_jsx_spread_attribute`): for any component JSX with `{...source}`, the compiler emits `<Comp {..._wrapSpread(source)}>`. `_wrapSpread` (`packages/core/core/src/props.ts`) walks `source`'s own keys via `Reflect.ownKeys` (no getter firing) and returns a new object whose getter-shaped values are re-branded as `_rp` thunks pointing back at the original. JS spread then copies the brands as plain data property values; `makeReactiveProps` converts them back to getters in the mount pipeline — preserving the reactive subscription end-to-end. Runtime fast path: sources with no getters return unchanged, so static spreads pay zero cost. DOM-element spreads (`<div {...rest}>`) are untouched — they go through the template path's `_applyProps` which already handles reactivity. Bisect-verified: reverting the JS path's `replacements.push` line fails `JSX transform — component elements > spread props on component are wrapped with _wrapSpread to preserve reactivity` with `expected 'const w = <Wrapper {...rest}…' to contain '{..._wrapSpread(rest)}'`.

---

### Manual prop-pipeline wrappers value-copying getter-shaped reactive props

(framework-internal fixes; user code now handled by the compiler-level fix above): Pyreon's reactive-prop contract is that `<Comp prop={signal()}>` compiles to `h(Comp, { prop: _rp(() => signal()) })`, `mount.ts` runs `makeReactiveProps` to convert `_rp`-branded thunks into property GETTERS, and any downstream consumer reading `props.prop` inside a tracking scope (JSX accessor, effect, computed) subscribes to the underlying signal. **Wrapper / HOC pipelines that COPY props via `result[key] = source[key]` in plain JS (not JSX spread) break this contract** — the value-read fires the getter at HOC setup time (outside any tracking scope), captures the resolved value, and stores it as a data property on the new object. Every downstream JSX accessor reading `props.prop` then sees the captured-once value, never re-subscribing to the signal. Same for spread (`{...A, ...B}`) and `Object.assign` — both are value-read + value-write. **Fix shape**: use `Object.getOwnPropertyDescriptors(source)` + `Object.defineProperty(target, key, descriptor)` to copy DESCRIPTORS instead of values. For data properties this is identical; for getter properties it preserves the live getter on the destination object. **Real-world hit**: `@pyreon/rocketstyle`'s `removeUndefinedProps` + 4 spread sites (HOC + `EnhancedComponent`) AND `@pyreon/styler`'s `buildProps` AND `@pyreon/ui-core`'s `omit` / `pick` all value-copied reactive props from package inception. Every signal-driven prop on every rocketstyle-wrapped component (the whole of `@pyreon/ui-components`, plus user-defined ones) silently lost reactivity. No existing test caught it because no test passed a signal-valued ordinary prop through the rocketstyle pipeline and asserted reactive DOM patching. **`@pyreon/kinetic` was the last residual hit** (correctness long-tail sweep): `createKineticComponent`'s prop split was a `for (const key in props) { htmlProps[key] = props[key] }` value-copy, the children carve-out was `const { children, ...restHtml } = htmlProps` (rest-destructure = value-copy), AND all four renderers re-spread `{ ...htmlProps }` into their `h(config.tag, …)` call — so every reactive HTML attr on every `kinetic('div')`-wrapped component (transition / collapse / stagger / group) froze at first render from package inception. Fixed by routing the split through `splitProps(props, [...KINETIC_KEYS])` + a second `splitProps(…, ['children'])` for the children carve-out, and replacing the renderer re-spreads with by-reference pass (Stagger/Group — no extra props) or `mergeProps(htmlProps, { ref, style })` (Collapse/Transition — ref + animation-controlled style override last-wins). The descriptor survives to `h(config.tag, htmlProps)` where `runtime-dom`'s `applyProps` detects `descriptor.get` and wraps the read in `renderEffect`. Reference: `packages/ui-system/kinetic/src/kinetic/createKineticComponent.tsx` + `{Collapse,Group,Stagger,Transition}Renderer.tsx`; bisect-verified at the real-Chromium layer (`packages/ui-system/kinetic/src/__tests__/kinetic.browser.test.tsx` — broken: `expected 'a' to be 'b'` on 3 reactive-forwarding specs, 5 non-reactive specs still pass; restored: 8/8). Reference: `packages/ui-system/rocketstyle/src/utils/attrs.ts:removeUndefinedProps` + the canonical `mergeProps` from `@pyreon/core` (which superseded the former rocketstyle/attrs-internal `mergeDescriptors` helpers — a sweep consolidated every framework descriptor-safe-merge call site onto the single canonical API), `packages/ui-system/styler/src/forward.ts:buildProps`, `packages/ui-system/ui-core/src/utils.ts:omit` / `pick`. **General rule for any wrapper that forwards user props**: copy descriptors, never values. Plain `result[key] = source[key]` is correct only when the source is known to carry no getters — which user-supplied props can never satisfy because the compiler emits them as `_rp` thunks that `makeReactiveProps` converts to getters. Companion writes (`finalProps.ref = ...`, `finalProps.X = newValue`) must use `Object.defineProperty` with a data descriptor — plain assignment to a getter-only descriptor is a silent no-op in non-strict mode and throws in strict mode. **The descriptor-aware "drop undefined keys, keep getters" filter is now a single `@pyreon/core` primitive — `removeUndefinedProps`, sitting next to `mergeProps` / `splitProps` / `makeReactiveProps` (it operates on core's own `_rp` encoding).** `@pyreon/attrs` and `@pyreon/rocketstyle` previously hand-rolled it identically, and the `@pyreon/attrs` copy historically shipped as a value-copy that silently broke reactive forwarding for `attrs(Component)` consumers — the exact divergence a single canonical home prevents. Both packages' `utils/attrs.ts` now re-export it from core. When you need to filter undefined keys off a props object before merging, use `removeUndefinedProps` from `@pyreon/core` — never write a fresh value-copy or descriptor-copy loop.

---

### Detecting "has direct subscribers" by reading `signal._d` alone

PR #1177 added a two-tier subscriber store on `signal()` — `_d1` is an inline slot for the FIRST direct subscriber (~all per-row label/class bindings inside `<For>` rows fall here); `_d` is a `Set` allocated lazily only on PROMOTION when a 2nd subscriber arrives. Any consumer that checks `if (signal._d && signal._d.size > 0)` to decide "is anyone subscribed?" gets a **false-negative** on every single-subscriber signal — `_d` is null when only `_d1` is in use. **Real-world hit**: `@pyreon/solid-compat`'s `sweepUnusedSignals` (`packages/tools/solid-compat/src/index.ts`) was about to evict LIVE store-backing signals because every per-row signal has exactly 1 direct subscriber — caught and fixed during the PR #1177 cross-package audit. **Fix shape**: check BOTH tiers — `const hasDirect = sigInternal._d1 !== null || (sigInternal._d && sigInternal._d.size > 0)`. **Why no exported helper today**: solid-compat is the only known consumer; cost-benefit doesn't justify a new internal API surface yet. If a second consumer surfaces, extract `_hasDirectSubscribers(sig)` from `@pyreon/reactivity` and migrate both. Until then, any code reading `_d` MUST also check `_d1`. Reference: `packages/core/reactivity/src/signal.ts` interface `SignalFn._d1` / `_d`; the canonical fix is in `packages/tools/solid-compat/src/index.ts:894-899`.

---

### Signal-like wrapper callables missing the internal `_v` field

(enforced by `@pyreon/lint` rule `pyreon/storage-signal-v-forwarding`): The compiler's `_bindText` / `_bindDirect` fast paths read `source._v` directly (not `source()`) for zero-call-overhead initial-value reads on cached signals. If you write a custom callable that wraps a base signal — delegating `.direct` / `.subscribe` / `.peek` to the underlying `sig` — you MUST also forward `_v` via getter: `Object.defineProperty(wrapper, '_v', { get: () => sig._v, configurable: true })`. Without this, the binding initializes the text/attribute to `''` (because `undefined` coerces to empty string) AND every subsequent `direct` callback reads `undefined` again — the binding fires, but writes the same empty value every time. The bug is invisible in unit tests that call `wrapper()` directly (which DOES delegate correctly via the function call) but fires in any consumer of the compiler-emitted fast path. **Real-world hit**: `@pyreon/storage`'s `useStorage` / `useSessionStorage` / `useCookie` / `useMemoryStorage` / `useIndexedDB` all shipped without `_v` forwarding from inception; SSR rendered `<strong>light</strong>` correctly but post-hydration the strong went empty and stayed empty even after `theme.set('dark')` updated localStorage. Reference: `packages/fundamentals/storage/src/local.ts:createStorageSignal` for the canonical fix shape; `_bindText` contract documented at `packages/core/runtime-dom/src/template.ts:_bindText` ("source has .direct() implies source has ._v"). The compiler triggers the fast path for the JSX shape `{() => identifier()}` where `identifier` resolves to a callable — including anything that quacks signal-like. **Canonical fix — use `wrapSignal(base, { set })` from `@pyreon/reactivity`** instead of hand-rolling the facade: it forwards `_v` / `.direct` / `.peek` / `.subscribe` / `.label` by construction, so the contract is impossible to forget. `@pyreon/storage` (all 5 backends) and `@pyreon/state-tree` (`trackedSignal`) now use it — and that surfaced the bug class in state-tree: its hand-rolled `trackedSignal` forwarded neither `.direct` NOR `_v`, so a model field bound via `{() => model.field()}` rendered empty (regression-locked by `state-tree/src/tests/tracked-signal-bind-contract.test.ts`, bisect-verified). The lint rule remains for any future hand-rolled facade that bypasses the primitive.

---
