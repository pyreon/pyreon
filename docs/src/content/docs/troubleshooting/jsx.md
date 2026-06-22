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

`const tab = (f) => <button>{f}</button>` then `<div>{tab('all')}{tab('active')}</div>` renders **`[object Object]`**, not buttons. Under a DOM-element parent the compiler treats a bare CallExpression child (`tab('all')`) as a reactive TEXT expression — it stringifies the returned VNode via `String(vnode)` → `"[object Object]"`. It typechecks and builds clean; only a real-browser render shows the bug (the returned type IS `VNode`, the compiler just binds it as text). The compiler only recognizes a fixed allowlist of VNode-producing calls as element children (`h` / `render` / `cloneVNode`); a user-defined helper isn't in it. **Fix:** either write the elements out inline, or extract a real component and use it as `<Tab f="all" />` (an uppercase tag is mounted as a component, not stringified). The same shape under a COMPONENT parent (`<Comp>{tab('all')}</Comp>`) hits the separate component-child handling — also avoid it there. Found authoring the `build-an-app` tutorial's filter tabs; surfaced only by the Playwright smoke (typecheck + SSG build both passed the broken form).

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
