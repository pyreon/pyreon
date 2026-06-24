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

### Calling a local JSX-returning helper inline under a DOM-element parent

`const tab = (f) => <button>{f}</button>` then `<div>{tab('all')}{tab('active')}</div>` renders **`[object Object]`**, not buttons. Under a DOM-element parent the compiler treats a bare CallExpression child (`tab('all')`) as a reactive TEXT expression — it stringifies the returned VNode via `String(vnode)` → `"[object Object]"`. It typechecks and builds clean; only a real-browser render shows the bug (the returned type IS `VNode`, the compiler just binds it as text). The compiler only recognizes a fixed allowlist of VNode-producing calls as element children (`h` / `render` / `cloneVNode`); a user-defined helper isn't in it. **Fix:** either write the elements out inline, or extract a real component and use it as `<Tab f="all" />` (an uppercase tag is mounted as a component, not stringified). The same shape under a COMPONENT parent (`<Comp>{tab('all')}</Comp>`) hits the separate component-child handling — also avoid it there. Found authoring the `build-an-app` tutorial's filter tabs; surfaced only by the Playwright smoke (typecheck + SSG build both passed the broken form). **PascalCase does NOT save a bare CALL** — `{MarkerGlyph(m, pts)}` (where `MarkerGlyph` returns a VNode) STILL stringifies to `[object Object]` under a DOM parent; the fix is the JSX ELEMENT form `<MarkerGlyph marker={m} pts={pts} />`, not renaming the helper (PascalCase only matters for the `no-bare-signal-in-jsx` LINT rule, a separate concern). Real instance: `@pyreon/flow`'s `MarkerDef` edge-arrowhead glyph shipped broken (`[object Object]` markers in every real app) because the package's vitest-browser tests use a JSX transform that does NOT hit the stringify path; only the real-compiler e2e caught it.

---

### Static-element reactive-attr/text refs computed AFTER a sibling `_mountSlot` (dynamic array / conditional child) → broken element-ref walk.

When a DOM/SVG element has a DYNAMIC child (`{arr.map(...)}`, `{cond && <x/>}`) positioned BETWEEN or BEFORE STATIC siblings that carry reactive attrs or interpolated text, the compiler emits those siblings' refs as `.nextSibling`/`.nextElementSibling` walks computed in source order — but `_mountSlot` for the dynamic child REMOVES its placeholder + inserts content BEFORE the trailing ref is computed, so the walk lands on the wrong node (`__eN.setAttribute is not a function` when it hits a text node; `Cannot read properties of null (reading 'replaceChild')` when it walks past the end). The edges-svg pattern works because its dynamic content is LAST; the bug needs a dynamic child with a reactive static sibling AFTER it. **This is a real compiler ordering bug** — the fundamentally-correct fix is to hoist ALL `__eN` static-ref computations ABOVE any `_mountSlot` so refs resolve against the pristine clone (deferred: deep, cross-backend compiler change). **Local workaround:** isolate the dynamic child in a STATIC wrapper so it can't shift the siblings' refs — `<g>{nodes.map(...)}</g>` (SVG) or `<div style="display:contents">{conditionals}</div>` (HTML, layout-neutral). Real instances: `@pyreon/flow` MiniMap (`{nodes.map}` between two `<rect>`s) + Controls (conditional buttons before the reactive zoom-% `<div>`) — both threw in every real app, both masked by the vitest-browser transform, both caught only by the real-compiler e2e. **General lesson reinforced:** the flow package's vitest-browser tests use a JSX transform that does NOT match the real `@pyreon/vite-plugin` compiler, so they MASK a class of real-compiler template bugs (markers, MiniMap, Controls all shipped broken + green-in-vitest). A real-compiler e2e (or `transformJSX` from `@pyreon/compiler` directly) is the only reliable gate for template-codegen correctness.

---

### Conditional WRAPPER child (`{cond && <div>…</div>}`) before a static sibling that gets ref-walked → `HierarchyRequestError` on a FRESH client mount (same class as the entry above; CodeBlock instance).

A component that conditionally renders a leading wrapper — `<root>{props.x && <header/>}<body>…</body></root>` — lowers the conditional to a `_mountSlot`, and `body`'s ref is `root.firstElementChild.nextElementSibling` (or `.nextSibling`) emitted AFTER that slot. On the FIRST client mount (the SPA-navigation path — NOT the in-place-hydrate path, which is why it hid until you clicked into the page) the absent conditional makes the slot remove its `<!>` placeholder, the sibling walk over-shoots, and a later `_mountSlot.insertBefore` runs against a Comment-node parent → `HierarchyRequestError: insertBefore … node type does not support this method` (or `Cannot read properties of null (reading 'nextSibling')`, depending on slot timing). Real instance: `@pyreon/zero-content`'s `<CodeBlock>` (conditional `{filename && <header>}` + `{showLineNumbers && <gutter>}`) — every docs code sample rendered broken on landing→docs nav. **Fix (local, backend-agnostic, single-`_tpl`-preserving): make the conditional wrappers ALWAYS-RENDERED static elements** (a `--empty` modifier class hides them when empty), so no `_mountSlot` precedes a ref'd element — the refs become stable `.firstElementChild`/`.nextElementSibling` walks over static elements. Two gotchas the fix surfaced, both worth their own rule: **(a) a dynamic boolean attribute on a templated element is buggy via the compiled binding** — the template path emits a raw `el.setAttribute("hidden", value)` with NO boolean-attr presence/absence guard, so `hidden={false}` sets `hidden="false"` (attribute PRESENT → still hidden); use a static prop-derived CLASS (className IS normalized) for per-instance show/hide, not a dynamic `hidden`/`disabled`/`checked` attr, until the compiler's template attr-setter learns boolean attrs (separate JS+Rust follow-up). **(b) a bare array-typed `const` child (`{gutter}` / `{() => gutter}`) is baked to `textContent`** by the compiler's sole-dynamic-child heuristic → stringifies VNodes to `[object Object]`; for a STATIC element-list inside a static template, build an HTML string + `dangerouslySetInnerHTML` (keeps the single cloneNode) rather than a `<For>` (a component child de-optimises the WHOLE tree off `_tpl` into `h()` composition). Masking caveat identical to the entry above: zero-content's vitest transform did NOT reproduce the crash (only a real-compiler e2e — landing→docs in real Chromium — caught it). Reference: `packages/zero/zero-content/src/components/CodeBlock.tsx` STRUCTURE NOTE; regression `e2e/docs.spec.ts` ("renders code blocks without a setup crash", bisect-verified) + the always-rendered `--empty` header/gutter unit specs.

---

### Flow overlay child order — `<Controls>` before a sibling `<MiniMap>` fails to render (a SIBLING-LEVEL manifestation of the slot-ordering bug above).

Distinct from the within-component case above: here the two overlays are SIBLING `<Flow>` children. `<Flow>` renders `{children}` (the user's `[Background, Controls, MiniMap, Panel]` array) as ONE dynamic slot, followed by a sibling reactive `{() => viewport}` accessor. When `<Controls>` (a component returning a reactive `() => <div>` accessor) is mounted BEFORE `<MiniMap>` in that array, Controls resolves its flow instance fine (instrumentation confirms `useContext` returns the instance) but its DOM is never mounted — the same dynamic-sibling-shifts-the-ref-walk class as line 27, at the children-array level rather than within a single template. **NOT root-caused** after multiple investigation rounds (ruled OUT: context resolution, the Controls reactive-accessor shape — a Controls stable-VNode refactor did NOT fix it); the fundamentally-correct fix is the same deferred `__eN`-hoist compiler change. **Workaround (user-facing, documented in `docs/flow.md` "Overlay child order" + the Controls/MiniMap JSDocs): place `<MiniMap>` BEFORE `<Controls>`.** `<Background>` / `<Panel>` / `<NodeResizer>` / `<NodeToolbar>` are unaffected and can sit anywhere. All flow examples (`examples/app-showcase/src/routes/flow`, `examples/fundamentals-playground/src/demos/FlowDemo.tsx`, `examples/app-showcase/src/routes/flow-features`, `docs/src/examples/flow/node-graph-drag-select-connect.tsx`) order MiniMap-first; locked by real-Chromium e2e in `app-showcase-flow.spec.ts`, `new-demos.spec.ts`, and `docs.spec.ts` (each asserts BOTH `.pyreon-flow-minimap` AND `.pyreon-flow-controls` are visible — a regression to Controls-first fails the controls assertion). Same masking caveat as line 27: the failure is invisible to vitest-browser (wrong JSX transform) — only real-compiler e2e catches it.

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
