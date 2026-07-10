---
title: "JSX Mistakes"
description: "Common jsx mistakes in Pyreon and how to fix them."
---

# JSX Mistakes

> **Generated** from `.claude/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### `key` on `<For>`

Use `by` not `key` — JSX reserves `key` for VNode reconciliation

**Detected by:** `for-with-key` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### Missing `by` on `<For>`

`<For each={...}>` without a `by` prop defeats keyed reconciliation — every update remounts the full list. Always supply `by={item => item.id}`.

**Detected by:** `for-missing-by` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### `.map()` in JSX

Use `<For>` for reactive list rendering, not `.map()`

---

### [FIXED — universal VNode[] mount, 2026-07] A VNode-returning call as a bare `{…}` child under a DOM-element parent

`const tab = (f) => <button>{f}</button>` then `<div>{tab('all')}{tab('active')}</div>` historically rendered **`[object Object]`**, not buttons — under a DOM-element parent the compiler classified a bare CallExpression child (`tab('all')`) as a reactive TEXT expression and stringified the returned VNode. It typechecked and built clean; only a real-browser render showed it, and SSR mounted the shape CORRECTLY (so it was also a guaranteed SSR↔client mismatch). **The compiler now MOUNTS the shape for IN-FILE helpers**: JSX-returning function bindings (`const cell = (v) => <b>{v}</b>`, `function cell(v) { return <b>{v}</b> }` — incl. conditional `string|VNode` returns) are tracked (scope-aware, same shadowing discipline as the signal auto-call pass), and a call child (`{cell(x)}`, incl. the accessor form `{() => cell(x)}`) routes through `_mountSlot(() => (cell(x)), …)` — reactive when args read signals, byte-identical in both backends, client now matching SSR. **Update — universal VNode[] child mounting (PR #2121) closed the general case:** the general reactive-text path now lowers to `bindPolymorphicText(() => expr, …)`, which detects a returned VNode/VNode[] at runtime and MOUNTS it — so a CROSS-FILE / general VNode-returning call (`{cell(x)}` where `cell` is imported, `{obj.render(x)}`) now renders correctly too (in-file helpers still take the `_mountSlot` route; array-literal / `.map()` consts take `_mountSlot`). The `[object Object]` stringify is essentially eliminated for a VNode in text position. **The residual `{sig()}`-holds-a-VNode footgun is CLOSED too (the `_bindText` VNode upgrade)**: the single-signal fast path is now text-FIRST, not text-only — on the first VNode-shaped value the RUNTIME permanently upgrades the binding to a subtree mount (swap core shared with `bindPolymorphicText`; string updates before any VNode stay byte-identical, the check runs only on the value-actually-changed branch). NOTE the previously-documented workaround was wrong: `{() => sig()}` never avoided the fast path (`tryDirectSignalRef` unwraps the accessor form) — which is exactly why the fix lives in `_bindText`, not in compiler classification. The dev warning now fires only for a DETACHED bound text node (nowhere to mount). Locked by `runtime-dom/src/tests/bindtext-vnode-upgrade.test.tsx` (compiled through the REAL transform; incl. SSR→hydrate parity + later-upgrade context-owner specs, bisect-verified). **Style guidance stands: prefer the JSX ELEMENT form** — extract a real component and use `<Tab f="all" />` (works cross-file, clearer intent); PascalCase does NOT change a bare CALL's classification (`{MarkerGlyph(m, pts)}` — the fix is the element form `<MarkerGlyph … />` when the helper lives in another file). Historical instances (why this entry exists): the `build-an-app` tutorial's filter tabs; `@pyreon/flow`'s `MarkerDef` edge-arrowhead glyph shipped broken because the package's vitest-browser tests use a JSX transform that does NOT hit the stringify path — only the real-compiler e2e caught it. Reference: `packages/core/compiler/src/jsx.ts` `jsxFnVars`/`isJsxHelperCall` + `native/src/lib.rs` mirrors; regression locks (bisect-verified): `compiler/src/tests/template-child-classification.test.ts` + `runtime-dom/src/tests/template-child-classification.test.tsx` (mount/reactive-arg/SSR-hydrate, compiled through the REAL transform).

---

### [FIXED, 2026-07] TS casts opaque to the template classifier — a wrapped accessor rendered its SOURCE.

Historical bug shape (kept for old-version diagnosis): `{(() => name()) as never}` — and even plain parens `{(() => name())}` — fell through to the STATIC bake arm (`__root.textContent = (() => name()) as never`), rendering the function SOURCE as literal text; `title={(() => x()) as never}` setAttribute'd the source string. Without the wrapper both were correct live bindings — the classifier simply never unwrapped TS type-only layers the way the signal auto-call pass already did ("parens/TS-layer transparent"). **The fix**: both backends unwrap `unwrapTypeLayers` at the child seam (`processOneChild`) AND the attr seam (`emitAttrExpression`), so `(expr) as never` compiles byte-identically to `expr` — casts are runtime-erased, so this is semantics-preserving by construction; the seeded fuzz grammar generates cast/paren wrappers around children + attrs to police the seam. **Style guidance: never cast an accessor to `as never`** — accessor-typed children/attrs accept the function form directly, and the cast hides real type errors (see also the `as-unknown-as-vnodechild` detector for the sibling cast smell). Reference: `packages/core/compiler/src/jsx.ts:processOneChild`/`emitAttrExpression` + `native/src/lib.rs` mirrors; regression locks (bisect-verified — reverted seams render `<div>() =&gt; name()</div>`): `compiler/src/tests/template-child-classification.test.ts` + `runtime-dom/src/tests/template-child-classification.test.tsx`.

---

### [FIXED — compiler ref-hoist, 2026-07] Static-element reactive-attr/text refs computed AFTER a sibling `_mountSlot` (dynamic array / conditional child) → broken element-ref walk.

Historical bug shape (kept for the lesson + old-version diagnosis): when a DOM/SVG element had a DYNAMIC child (`{arr.map(...)}`, `{cond && <x/>}`, `{cond() ? <A/> : <B/>}`) positioned BETWEEN or BEFORE STATIC siblings carrying reactive attrs or interpolated text, the compiler emitted those siblings' refs as `.nextSibling`/`.nextElementSibling` walks computed in source order — but `_mountSlot` for the dynamic child REMOVES its `<!>` placeholder + inserts content + a `<!--pyreon-->` marker BEFORE the trailing ref was computed (net sibling-count delta ≠ 0), so the walk landed on the wrong node (`Cannot read properties of undefined (reading 'setProperty')` when `_setStyle` hit the marker comment; `null (reading 'setAttribute')` / `null (reading 'data')` when it walked past the end). **The class was WORSE than misbind/crash — delayed sibling-slot anchor destruction: with TWO adjacent slots, the second slot's own inline placeholder walk resolved to the FIRST slot's reactive marker, which `_mountSlot` then REMOVED; slot 0's next falsy→truthy re-flip threw `insertBefore … is not a child of this node` (unhandled effect error) and SILENTLY LOST the subtree.** Failure was initial-state-dependent (single flips accidentally correct — only the double flip fired the subtree loss, which is why the e2e gates never caught it; fires on both plain client mount AND post-hydration). **The fix (both backends, byte-identical): two-phase template-bind emission** — phase 1 (`refLines`) captures EVERY pristine-clone node reference (element walks `const __eN = …`, sole-text captures `const __tN = X.firstChild`, hoisted placeholder consts `const __pN = <walk>` for `_mountSlot` args + `replaceChild` targets) BEFORE phase 2 (`bindLines`) runs any mutation — phase-2 ops are identity-based, hence order-independent w.r.t. sibling structure. Reference: `packages/core/compiler/src/jsx.ts:buildTemplateCall` (refLines/bindLines + `hoistPlaceholderRef`) + `native/src/lib.rs:TemplateBuilder.ref_lines`; regression locks (bisect-verified): `compiler/src/tests/template-ref-hoist.test.ts` (emit ordering) + `runtime-dom/src/tests/slot-before-sibling-refs.test.tsx` (mount/flip/hydrate behavior incl. the double-flip subtree-loss shape, compiled through the REAL transform). The old static-wrapper workaround (`<g>{nodes.map(...)}</g>` / `<div style="display:contents">{conditionals}</div>`) is no longer required on current versions — still valid guidance for apps pinned to older compilers. Real historical instances: `@pyreon/flow` MiniMap (`{nodes.map}` between two `<rect>`s) + Controls (conditional buttons before the reactive zoom-% `<div>`). **General lesson (still live):** the flow package's vitest-browser tests use a JSX transform that does NOT match the real `@pyreon/vite-plugin` compiler, so they MASK this class of real-compiler template bugs (markers, MiniMap, Controls all shipped broken + green-in-vitest). A real-compiler e2e (or `transformJSX` from `@pyreon/compiler` directly) is the only reliable gate for template-codegen correctness — the new regression suites compile through the REAL transform for exactly this reason.

---

### [root cause FIXED by the compiler ref-hoist above] Conditional WRAPPER child (`{cond && <div>…</div>}`) before a static sibling that gets ref-walked → `HierarchyRequestError` on a FRESH client mount (same class as the entry above; CodeBlock instance).

A component that conditionally renders a leading wrapper — `<root>{props.x && <header/>}<body>…</body></root>` — lowers the conditional to a `_mountSlot`, and `body`'s ref was `root.firstElementChild.nextElementSibling` (or `.nextSibling`) emitted AFTER that slot. On the FIRST client mount (the SPA-navigation path — NOT the in-place-hydrate path, which is why it hid until you clicked into the page) the absent conditional made the slot remove its `<!>` placeholder, the sibling walk over-shot, and a later `_mountSlot.insertBefore` ran against a Comment-node parent → `HierarchyRequestError: insertBefore … node type does not support this method` (or `Cannot read properties of null (reading 'nextSibling')`, depending on slot timing). Real instance: `@pyreon/zero-content`'s `<CodeBlock>` (conditional `{filename && <header>}` + `{showLineNumbers && <gutter>}`) — every docs code sample rendered broken on landing→docs nav. **The compiler ref-hoist (entry above) removes the bug class at the root** — sibling refs now resolve against the pristine clone before any slot mutates it. CodeBlock's local fix predates it and stays as-shipped (**always-RENDERED static wrappers** with a `--empty` modifier class — harmless, still valid, no churn needed). Two gotchas the fix surfaced, both worth their own rule: **(a) a dynamic boolean attribute on a templated element is buggy via the compiled binding** — the template path emits a raw `el.setAttribute("hidden", value)` with NO boolean-attr presence/absence guard, so `hidden={false}` sets `hidden="false"` (attribute PRESENT → still hidden); use a static prop-derived CLASS (className IS normalized) for per-instance show/hide, not a dynamic `hidden`/`disabled`/`checked` attr, until the compiler's template attr-setter learns boolean attrs (separate JS+Rust follow-up). **(b) [NOW MOUNTS — universal VNode[] mounting] a bare array-typed `const` child (`{gutter}` / `{() => gutter}`)** used to bake to `textContent` and stringify VNodes to `[object Object]`; it now routes through `_mountSlot(gutter, …)` (array-literal / `.map()` consts mount, and any other VNode/VNode[] source mounts via `_setChild`/`bindPolymorphicText`), so the elements render. The CodeBlock `dangerouslySetInnerHTML` workaround is no longer required (it stays as-shipped, harmless); for a reactive keyed list still prefer `<For>`. Masking caveat identical to the entry above: zero-content's vitest transform did NOT reproduce the crash (only a real-compiler e2e — landing→docs in real Chromium — caught it). Reference: `packages/zero/zero-content/src/components/CodeBlock.tsx` STRUCTURE NOTE; regression `e2e/docs.spec.ts` ("renders code blocks without a setup crash", bisect-verified) + the always-rendered `--empty` header/gutter unit specs.

---

### [FIXED by the compiler ref-hoist above — bisect-verified in real Chromium] Flow overlay child order — `<Controls>` before a sibling `<MiniMap>` failed to render (a SIBLING-LEVEL manifestation of the slot-ordering bug above).

Distinct from the within-component case above: here the two overlays are SIBLING `<Flow>` children. `<Flow>` renders `{children}` (the user's `[Background, Controls, MiniMap, Panel]` array) as ONE dynamic slot, followed by a sibling reactive `{() => viewport}` accessor whose stale inline placeholder walk this class corrupted. Historically, when `<Controls>` (a component returning a reactive `() => <div>` accessor) was mounted BEFORE `<MiniMap>` in that array, Controls resolved its flow instance fine but its DOM was never mounted (silently — zero console errors) — never root-caused at the time, but consistent with the two-adjacent-slots anchor-destruction variant (the second slot's stale walk resolved to a node inside the first slot's mounted content and removed it). **The compiler ref-hoist fixes it — verified with the full dev-server bisect recipe** (fixed compiler lib+native, Controls-first flip of `FlowDemo.tsx`, real Chromium against `vite dev`: BOTH `.pyreon-flow-minimap` and `.pyreon-flow-controls` visible + live zoom text, zero console errors; reverted compiler: `controls: 0` — the exact historical failure; restored: both visible). **The MiniMap-before-Controls ordering constraint is no longer required on current compiler versions.** The shipped examples + the real-Chromium e2e (`app-showcase-flow.spec.ts`, `new-demos.spec.ts`, `docs.spec.ts`) still order MiniMap-first and assert both overlays visible — KEEP those assertions (they now lock the fix rather than the workaround); flipping an example to Controls-first is safe but not required. Apps pinned to older compilers still need MiniMap-first. Same masking caveat as the entry above: the failure was invisible to vitest-browser (wrong JSX transform) — only real-compiler e2e/dev-server checks catch this class.

---

### A custom-node interactive control (toolbar button, input) starting a node drag and swallowing its click.

A flow/diagram node's pointerdown handler that starts a drag (esp. with `setPointerCapture`) must FIRST bail when the target is inside an interactive control — `target.closest('.pyreon-flow-node-toolbar, .nodrag, button, input, textarea, select, a')` → return without dragging (React Flow's `.nodrag` convention). Otherwise pointerdown-on-button starts a drag, captures the pointer, and the button's `click` never fires. Reference: `@pyreon/flow` `flow-component.tsx` node `onPointerDown`. **Sibling rule — a container-level `keydown` handler that owns shortcuts (Delete / Cmd-A / Cmd-C / Cmd-V / Cmd-Z) must FIRST bail when `e.target` is an editable element** (`INPUT` / `TEXTAREA` / `SELECT` / `isContentEditable`) — guard ALL shortcut branches, not just Delete. Otherwise typing in an editable field inside a node hits the container's `keydown` (events bubble) and `Cmd-A` selects all NODES instead of the field's text, `Cmd-Z` undoes the diagram, etc. `@pyreon/flow`'s `handleKeyDown` shipped with only the Delete branch guarded; the fix is a single top-of-handler editable-target early-return — same principle as the `.nodrag` bail (a container interaction handler must respect when the user is interacting with an editable descendant).

---

### `className`/`htmlFor`

Use `class` and `for` — standard HTML attributes

---

### `onChange` on inputs

Use `onInput` for keypress-by-keypress updates (native DOM events)

---

### Ternary for conditionals

Use `<Show>` for signal-driven conditions (more efficient)

---

### Wrapping signal reads in String()

`{String(count())}` is unnecessary — `{count()}` works directly in JSX text, numbers auto-coerce. The compiler wraps signal reads reactively regardless.

---

### Function accessors for dimension props

`state={() => expr}` is wrong — rocketstyle dimension props (`state`, `size`, `variant`) accept string values, not function accessors. Use `state={expr}` and let the compiler handle reactivity via `_rp()` wrapping.

---

### Treating a `<For>`/render-callback param as reactive component props (compiler-internal)

a JSX-child render callback — `<For each={rows}>{(row) => <td>{row.id}</td>}</For>` (also `<Index>`, `<Show>`, `<Switch>`) — receives a runtime ITEM the framework passes per row, NOT reactive component `props`. `maybeRegisterComponentProps` MUST skip it (the param is not props), or every bare item-property read (`row.id`) is misclassified as reactive → wrapped in a per-row `_bind(() => …)` renderEffect instead of a one-time static `textContent =`. A 1k–10k-row list then allocates 1k–10k unnecessary renderEffects + disposer closures (retained until unmount; CPU + heap waste; `row.id` never changes for a mounted keyed row, so the effect never even re-fires — pure waste). The skip condition: parent is a `JSXExpressionContainer` whose grandparent is a `JSXElement`/`JSXFragment` (a JSX-CHILD render callback). **Do NOT skip attribute-value functions** (`component={(p) => …}` — grandparent is `JSXAttribute`) — those can be real inline components receiving props. Signal-valued item reads (`row.label()`, `() => row.x`) and real components (`function Row(props) { return <td>{props.x}</td> }`) stay reactive via their own paths. Both backends mirror this (JS `maybeRegisterComponentProps`; Rust `Ctx.in_jsx_child_callback`). Reference: `packages/core/compiler/src/jsx.ts:maybeRegisterComponentProps`; regression at `static-text-baking.test.ts` (`<For> render-callback item params` — self-discriminating, bisect-verified).

---

### Boolean ARIA-STATE attributes render as presence-only `""`, NOT `"true"` (a11y bug)

`aria-checked={checked()}` / `aria-selected={isActive()}` / `aria-expanded={isOpen()}` / `aria-disabled={x}` where the value is a BOOLEAN renders `aria-checked=""` (empty-string presence) — because `runtime-dom`'s `applyStaticProp` (`packages/core/runtime-dom/src/props.ts`) checks `typeof value === 'boolean'` **BEFORE** the `aria-`/`data-` branch (`if (value) setAttribute(key, '') else removeAttribute(key)`). An empty `aria-checked=""` is an INVALID ARIA value — screen readers do NOT read it as "true"; they fall back to the default (effectively unchecked/unselected/collapsed). So a checked switch / selected tab / expanded tree node is announced as its OPPOSITE. **Fix**: ARIA STATE attributes must be the literal STRING `'true'`/`'false'` (or `'mixed'`), never a boolean — `aria-checked={checked() ? 'true' : 'false'}`. A STRING value skips the boolean branch and lands in the `aria-` `setAttribute(key, String(value))` branch → `aria-checked="true"`. For `aria-disabled` use `x ? 'true' : undefined` (absent when not disabled is fine; `'true'` when disabled). **This affects BOTH paths**: JSX attributes (`aria-checked={signal()}`) AND helper-object spreads (`{ 'aria-selected': isSelectedFn() }`) — both ultimately go through `applyStaticProp`. **Detection trap**: a browser test asserting `el.hasAttribute('aria-checked')` PASSES for both `""` and `"true"` — it MASKS the bug. Always assert the VALUE: `expect(el.getAttribute('aria-checked')).toBe('true')`. Fixed across all 6 `@pyreon/ui-primitives` interactive primitives (Switch/Checkbox/Radio/Tabs/Combobox/Tree) — they all shipped boolean aria-state from inception; the browser smokes only checked `hasAttribute`, so it stayed hidden. Bisect-verified (revert one to boolean → `expected '' to be 'true'`). Reference: `packages/core/runtime-dom/src/props.ts:applyStaticProp` (the boolean-before-aria ordering); `code-style.md` "Render-function primitives provide ARIA helpers".

---
