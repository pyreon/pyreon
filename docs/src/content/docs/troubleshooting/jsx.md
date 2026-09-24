---
title: "JSX Mistakes"
description: "Common jsx mistakes in Pyreon and how to fix them."
---

# JSX Mistakes

> **Generated** from `.agents/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### `key` on `<For>`

Use `by`, not `key` — JSX reserves `key` for VNode reconciliation.

**Detected by:** `for-with-key` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### Missing `by` on `<For>`

`<For each={...}>` without `by` defeats keyed reconciliation, so every update remounts the whole list. Always supply `by={item => item.id}`.

**Detected by:** `for-missing-by` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### `.map()` in JSX

Use `<For>` for reactive list rendering, not `.map()`.

---

### A VNode-returning call as a bare `{…}` child of a DOM element

`<div>{tab('all')}</div>` where `tab` returns JSX now mounts correctly on every path, so prefer the element form `<Tab f="all" />` for clarity (PascalCase does not change how a bare call is classified).
  - In-file JSX-returning helpers are tracked (`jsxFnVars`/`isJsxHelperCall` in `compiler/src/jsx.ts` + `native/src/lib.rs`) and emit `_mountSlot(() => (cell(x)), …)`.
  - Any other call (imported helper, `obj.render(x)`) lowers to `bindPolymorphicText`, which mounts a returned VNode/VNode[] at runtime.
  - `{sig()}` holding a VNode: `_bindText` is text-first and upgrades to a subtree mount on the first VNode value. `{() => sig()}` takes the same fast path (`tryDirectSignalRef` unwraps it). The dev warning fires only for a detached text node.
  - Locked by `compiler/src/tests/template-child-classification.test.ts`, `runtime-dom/src/tests/template-child-classification.test.tsx`, `runtime-dom/src/tests/bindtext-vnode-upgrade.test.tsx`.

---

### Casting an accessor child or attribute `as never`

The compiler unwraps TS type layers and parens (`unwrapTypeLayers` at `processOneChild` and `emitAttrExpression`, both backends), so `{(() => name()) as never}` compiles like the uncast form. Still, never write the cast: accessor-typed children and attributes accept the function directly, and the cast hides real type errors. Locked by the `template-child-classification` tests above; the fuzz grammar generates cast/paren wrappers.

---

### Template sibling refs resolved after a `_mountSlot` mutated the clone

A dynamic child (`{arr.map(…)}`, `{cond && <x/>}`) before a static sibling with bindings used to shift `.nextSibling` walks (misbinds, `HierarchyRequestError`, and with two adjacent slots a silently lost subtree).
  - Rule: template-bind emission is two-phase. Phase 1 (`refLines`) captures every node reference on the pristine clone, including hoisted placeholder consts (`hoistPlaceholderRef`); phase 2 (`bindLines`) mutates by identity only. Reference: `compiler/src/jsx.ts:buildTemplateCall` + `native/src/lib.rs:TemplateBuilder.ref_lines`.
  - Old workarounds (static wrappers, always-rendered `--empty` wrappers in zero-content's `CodeBlock.tsx`, MiniMap-before-Controls ordering in `@pyreon/flow`) are no longer needed but are harmless; keep the e2e assertions that both flow overlays render.
  - Vitest-browser suites that use the oxc automatic JSX runtime do not exercise the real compiler. Gate template-codegen changes with `transformJSX` or a real-compiler e2e. Locked by `compiler/src/tests/template-ref-hoist.test.ts`, `runtime-dom/src/tests/slot-before-sibling-refs.test.tsx`, `e2e/docs.spec.ts`.

---

### Relying on the `h()`-path parity fuzz for compiled-path changes

`hydration-parity-fuzz.test.tsx` builds trees with `h()` and never exercises `_tpl`/`_mountSlot`/`_textSlot`. Its sibling `hydration-parity-fuzz-compiled.test.tsx` (grammar in `_hydration-fuzz-grammar.ts`) compiles one seeded source through `transformJSX` for both the SSR emit and the client emit and hydrates one over the other.
  - The server arm must be the compiled SSR emit, not the `h()` form: the compiler brackets a component's `{props.children}` slot with its own `$` range and `h()` does not, so mixing them duplicates content and looks like a runtime bug.
  - Root swaps and adoption bails are a retention ratchet, not a hard oracle (a template whose adoption bails takes the documented swap fallback).

---

### SSR and client emits disagreeing on reactive levels for a slot

Both emits must wrap `{props.children}` using the same `shouldWrap` predicate the `h()` path uses. When the client passed it bare, a function-valued `children` produced one level on the client and two in the markup, and hydration mounted the text twice. Element-valued consts (`{el}`) are deliberately not wrapped. Derive any marker count both sides must agree on from one predicate. Locked by `compiler/src/tests/template-slot-emit-parity.test.ts` + `runtime-dom/src/tests/compiled-slot-parity.test.tsx`.

---

### A template classification predicate reading direct children instead of flattened ones

`elementHasDynamic` must look through fragments, because the emit consumes the flattened child list. `<b><i/><>{x}</></b>` otherwise gets no phase-1 ref for `<b>`, and its phase-2 walk runs from an already-replaced placeholder (`null.replaceChild`). Mirrored in Rust.

---

### A guard on a branch designed for `null` that is not null-safe

`_mountSlot`'s marker-less branch is documented to receive `null` for an empty sole slot (accessor rendered `null`, markers elided). Guards added there (`isMidSlotText`) must accept `null`. A throw inside an adopt bind is caught by `hydrateComponent`, which keeps the server nodes but orphans every binding with no visible error. Treat a `console.error` from that catch as a failed adoption. Locked by `runtime-dom/src/tests/hydrate-empty-sole-slot.test.tsx`.

---

### A compiled template in component-child position evaluated before the component's setup

`<Provider><div>{useCtx()}</div></Provider>` passes `_tpl(…)` as an argument, so its `renderEffect`s would snapshot the pre-`provide()` context owner and read the default.
  - Fix: a component's sole child is emitted `{_lc(() => _tpl(…))}`, a memoized untracked thunk branded `REACTIVE_PROP`. `makeReactiveProps` turns it into a getter that returns the value, so structural consumers (`Switch`, kinetic `resolveChildren`, Iterator, compat `Children.*`) are unaffected.
  - A compiled template may only construct DOM. Any emitted work ordered against a component's setup (a binding, a context read, a nested mount) must be deferred until the component reads `props.children`.
  - Limitation: multi-child parents and member-expression tags (`<Ctx.Provider>`) stay eager.
  - Template-emission changes need the `ui-showcase-regression` e2e: this class needs a provider above a templatized element, which synthetic fixtures lack. Reference: `core/src/props.ts:_lc`, `compiler/src/jsx.ts:isSoleComponentChild`/`braceTemplateChild`, `native/src/lib.rs:brace_template_child`. Locked by `runtime-dom/src/tests/lazy-component-children.test.tsx` + the `_lc` block in `compiler/src/tests/native-equivalence.test.ts`.

---

### Absorbing component children into a template (`templatizeComponentChildren`)

The option bakes an element skeleton and mounts trailing component children into the clone. It is default on in `@pyreon/vite-plugin` and opt-in in the `@pyreon/compiler` primitive. Three requirements:
  - Ordering: a `_tpl` bind runs when its call expression evaluates. Only the `_lc`-deferred sole-child position may absorb; every other eager-argument position (multi-child component parent, member/namespaced tag, fragment, expression container) bails to `h()` (`templateMountIsEagerlyOrdered`).
  - The absorbed child is a preserved hole that is walked, never a source slice (a slice drops `_rp`, `_lc` and nested `_tpl`).
  - The absorbed child's element needs a phase-1 ref const (the two-phase rule above).
  - Only the shape `[element*][component+]` (components in one trailing run) is absorbed; any other arrangement emits byte-identically to the option being off. Locked by `runtime-dom/src/tests/templatize-component-children.test.tsx`.

---

### A template mount hole without extent, hydrate counterpart and sweep

A template's skeleton is adoptable only while it fully describes the DOM it claims. For a trailing mount hole the compiler bakes `data-pyreon-hole` (`TPL_HOLE_ATTR`) on the element, which `_tpl` strips at parse time.
  - `matchDomAgainstTemplate` matches the template's own `k` children, then skips the hole range; `k` is read off the template (`el.children.length`), so no count crosses the compiler/runtime boundary.
  - The bind hydrates the range instead of mounting into it (`_mountChild` in hydrate mode), and sweeps whatever it did not claim.
  - The hole must be declared, never inferred: `_setChild` and spread `innerHTML` also fill empty elements and do not hydrate. A verifier relaxation alone duplicates content.
  - The parent's closing tag supplies the extent, so SSR emits no extra markers. Anything static after a component is not absorbed.
  - Reference: `compiler/src/jsx.ts:TPL_HOLE_ATTR` + `processChildren` (both backends), `runtime-dom/src/template.ts`, `hydration-plan.ts:matchDomAgainstTemplate`. Locked by `runtime-dom/src/tests/hydrate-template-hole-limit.test.tsx` + `mount-hole-adoption.browser.test.tsx`. Bisect per backend: `transformJSX` prefers the native binary, so reverting only the JS side passes.

---

### Container pointer/keyboard handlers that ignore interactive descendants

In `@pyreon/flow` (`flow-component.tsx`):
  - A node's drag `pointerdown` must bail when `target.closest('.pyreon-flow-node-toolbar, .nodrag, button, input, textarea, select, a')` matches, or `setPointerCapture` swallows the control's click (React Flow's `.nodrag` convention).
  - The pan `handlePointerDown` must also bail on the framework chrome (`.pyreon-flow-controls, .pyreon-flow-minimap, .pyreon-flow-panel`), or the zoom and fit-view buttons do nothing.
  - A container `keydown` that owns shortcuts (Delete, Cmd-A/C/V/Z) must return early when `e.target` is `INPUT`/`TEXTAREA`/`SELECT`/`isContentEditable`, for every branch.
  - A synthetic `el.click()` bypasses pointer capture and passes; only a real coordinate click reproduces the bug. Locked by `e2e/app-showcase-flow.spec.ts` + `flow/src/tests/edge-render.browser.test.tsx`.

---

### `<label onClick={toggle}>` around a hidden `<input onChange={toggle}>`

The label forwards its click to the input, and that click bubbles back, so `onChange` fires two or three times per click. Fix: `onClick={(e) => { e.preventDefault(); toggle() }}` on the label; the input stays in sync through its reactive `checked` binding. happy-dom forwards even past `preventDefault`, so put exact-count assertions under `describe.runIf(isBrowser)` (gate on `__vitest_browser__`). Reference: `@pyreon/ui-primitives` `CheckboxBase`/`RadioGroupBase`; locked by `ui/primitives/src/toggle-primitives-interaction.browser.test.tsx`.

---

### A `width/height: 100%` SVG overlay inside a 0×0 containing block

A zero-area SVG viewport paints nothing, even though its paths exist and `getTotalLength()` is positive. Give the containing block a definite size (`.pyreon-flow-viewport { width: 100%; height: 100% }`, `overflow: visible`). A full-size transformed viewport then needs `pointer-events: none`, re-enabled on nodes (`auto`) and edge paths (`stroke`). Assert a rendered box (`getBoundingClientRect().width > 0`), not a path count. Measure content-sized nodes (`ResizeObserver` via `measureRef`) and prefer `node.width ?? measured ?? 150` for edge geometry. Reference: `flow/src/components/flow-component.tsx`; locked by `e2e/app-showcase-flow.spec.ts` + `flow/src/tests/edge-render.browser.test.tsx`.

---

### Attribute bake escaping diverging from text bake escaping

Both must encode line terminators (`\n`, `\r`, U+2028/9) as `&#N;`, preserve well-formed entities, and use the cooked template-literal value. `escapeHtmlAttr` (JSX string, entity-aware `&`) and `escapeLiteralAttr` (JS string, unconditional `&`) mirror `escapeLiteralText`. Without this a multi-line attribute breaks the build (`Unterminated string`) and `title="a&quot;b"` double-escapes. When a seam has two consumers of one contract, fix both. Locked by `compiler/src/tests/template-escape-audit.test.ts` + `runtime-dom/src/tests/template-escape-audit.test.tsx`.

---

### A plain attribute after a spread on a templated element

`<a {...p} rel="noopener">` means the later key wins, but the template baked the static value and then applied the spread over it. `hasBailAttr` bails such elements to `h()`. A plain attribute before the spread keeps the template (the spread legitimately wins).

---

### Entity-escaping raw-text elements (`<script>`/`<style>`)

Their content is not parsed for entities, so escaping corrupts CSS/JS. The compiler bails raw-text elements with content to `h()` in both `_tpl` and `_ssr` emitters (`RAW_TEXT_ELEMENTS`; `<iframe>` is excluded because its fallback never renders). `runtime-server` serializes their text with a raw-text-safe escape that neutralises only `</script`, `<script` and `</style`. A void element written with children (`<br>x</br>`) also bails. happy-dom decodes entities inside `<style>`, so rely on the compiler emit spec and `runtime-dom/src/tests/raw-text-template.browser.test.tsx`.

---

### A scope pass that recognises only some binding forms

Signal auto-call must not rewrite a name shadowed by any binding: `catch (x)`, `for (const x of …)`, nested/default/rest destructuring, block-scoped `let`, function or class declarations. `collectFunctionBindings` (both backends) walks params and every declaration at any block depth; the over-approximation can only skip an auto-call, never mis-call. Enumerate the language's binding grammar, not the shapes you have seen.

---

### SSR fast-path attribute seams diverging from `renderProp`

In `ssrSerializeAttr` (both backends):
  - Skip every event-handler spelling in `SSR_EVENT_HANDLER_ATTRS` (mirrored from the runtime, identity-locked like `SSR_URL_ATTRS`), including lowercase `onclick`; otherwise the handler is invoked during server render.
  - A boolean `aria-*` literal follows the runtime string rule (`aria-hidden={false}` → `aria-hidden="false"`).
  - `ssrProvablyString` may prove a string only from the value's own syntax (literal, template, concat with a literal side) or a global the module provably does not rebind, never from a method name like `x.join()`.
  - Locked by `compiler/src/tests/ssr-fast-path-attr-parity.test.ts`, `runtime-dom/src/tests/ssr-template-differential.test.tsx` and the SSR render fuzz grammar.

---

### Plain Mode total tracking hoisting reads it does not own

The prologue (`void (a());`) may hoist a read only at the effect's own function depth and only for a name not declared inside the effect (`hoistable(frame, name)`). Reads inside nested callbacks (`setTimeout`, cleanups) are never hoisted, matching classic code. A hoisted member path is optionally chained (`s()?.items?.[0]?.id`) because it runs before the author's guards. Change the JS oracle (`compiler/src/plain.ts:recordRead`/`recordPath`) and the Rust mirror (`native/src/plain.rs`) together; `plain-native-equivalence.test.ts` locks byte equality.

---

### A classification probe that invokes an accessor and then re-renders the original children

SSR calls a function child exactly once. Resolve children once into a list, classify the resolved values, and render those. Reference: `runtime-server/src/index.ts:rawTextChildren`/`rawTextContent`.

---

### `className`/`htmlFor`

Use `class` and `for` — standard HTML attributes.

---

### `onChange` on inputs

Use `onInput` for keypress-by-keypress updates (native DOM events).

---

### Ternary for conditionals

Use `<Show>` for signal-driven conditions (more efficient).

---

### Wrapping signal reads in String()

`{String(count())}` is unnecessary; `{count()}` works in JSX text and numbers auto-coerce.

---

### Function accessors for dimension props

Rocketstyle dimension props (`state`, `size`, `variant`) take string values. Write `state={expr}` and let the compiler wrap it with `_rp()`, not `state={() => expr}`.

---

### Treating a `<For>`/render-callback param as reactive props (compiler-internal)

A JSX-child render callback (`<For each={rows}>{(row) => <td>{row.id}</td>}</For>`, also `<Index>`, `<Show>`, `<Switch>`) receives a per-row item, not props. `maybeRegisterComponentProps` must skip it, or every `row.id` read becomes a per-row `renderEffect` instead of a one-time static write. Skip condition: parent is a `JSXExpressionContainer` whose grandparent is a `JSXElement`/`JSXFragment`. Do not skip attribute-value functions (`component={(p) => …}`), which can be real components. Rust mirror: `Ctx.in_jsx_child_callback`. Locked by `compiler/src/tests/static-text-baking.test.ts` (`<For> render-callback item params`).

---

### Boolean ARIA-state attributes

Emit ARIA state as the strings `'true'`/`'false'` (or `'mixed'`), never booleans: `aria-checked={checked() ? 'true' : 'false'}`; for optional state use `x ? 'true' : undefined`.
  - Runtime safety nets exist: `setStaticProp` (`runtime-dom/src/props.ts`, SSR-mirrored) coerces a boolean `aria-*` to `"true"`/`"false"` before the generic boolean-presence branch, and the compiled template path routes dynamic attributes through `_setAttr` (= `applyAttrProp`), which removes the attribute for `null`/`undefined`. Do not lean on the nets in source.
  - All `@pyreon/ui-primitives` aria-state emissions are strings. Keep new helpers that way.
  - Assert the value and absence (`getAttribute('aria-checked') === 'true'`), never `hasAttribute`, which passes for `""`. Locked by `ui/primitives/src/aria-state.browser.test.tsx`. See `.agents/rules/code-style.md` "Render-function primitives provide ARIA helpers".

---
