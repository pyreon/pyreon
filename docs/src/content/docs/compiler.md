---
title: '@pyreon/compiler'
description: JSX reactive transform that wraps dynamic expressions in reactive getters for fine-grained DOM updates.
---

`@pyreon/compiler` provides the JSX transform that makes Pyreon's fine-grained reactivity work. It analyzes JSX expressions at build time and wraps dynamic values in `() =>` arrow functions so the runtime receives reactive getters instead of eagerly-evaluated snapshots. It also performs static VNode hoisting and template emission for optimal DOM creation performance.

<PackageBadge name="@pyreon/compiler" href="/docs/compiler" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/compiler
```

```bash [bun]
bun add @pyreon/compiler
```

```bash [pnpm]
pnpm add @pyreon/compiler
```

```bash [yarn]
yarn add @pyreon/compiler
```

:::

Most users do not need to install the compiler directly. It is used internally by `@pyreon/vite-plugin`. Install it directly only if you are building a custom build tool integration.

## Architecture Overview

The compiler performs three sequential optimization passes on your JSX source code:

1. **Template emission** -- Multi-element DOM trees are compiled to `_tpl()` calls that use `cloneNode(true)` for fast instantiation.
2. **Static VNode hoisting** -- Fully static JSX expressions inside expression containers are lifted to module scope.
3. **Reactive wrapping** -- Dynamic expressions containing signal reads are wrapped in `() =>` arrow functions.

Each pass is applied during a single AST walk. The compiler has a **dual-backend architecture**: a Rust native binary (napi-rs, 3.7-8.9x faster) using `oxc_parser`/`oxc_ast` Rust crates directly, with an automatic JS fallback via `oxc-parser` when the native binary isn't available. Both backends emit positional, non-overlapping `{start, end, text}` edits against the original source, so the output stays close to the input.

### Source maps

The transform shifts line counts (a one-line JSX element can expand into a multi-line `_tpl(...)` factory), so a source map is required for stack traces and debugger breakpoints in Pyreon components to resolve to the right source line. The **JS backend** applies its edits through [`magic-string`](https://github.com/Rich-Harris/magic-string) and returns a correct **V3 source map** alongside byte-identical code; `@pyreon/vite-plugin` forwards it to Vite. Caveats, stated honestly:

- The **native (Rust) backend** does not emit a source map yet — a scoped follow-up. When the native binary is active (the default in production builds), the map is absent and frames fall back to the transformed positions until that lands.
- In dev mode, the small extra HMR / signal-name injections the Vite plugin applies _after_ the compiler are not re-mapped — a minor residual offset, still far better than no map.

A no-op compile (nothing to transform) returns no map, since the emitted code is byte-identical to the input and needs no remapping.

## Pass 1: Reactive Wrapping

### Signal Auto-Call

Signals and computeds declared via `const x = signal(...)` or `const x = computed(...)` are **automatically called** in JSX — no `()` needed:

```tsx
const count = signal(0)
const doubled = computed(() => count() * 2)

// You write (plain JavaScript):
<div class={count > 0 ? 'active' : ''}>{doubled}</div>

// Compiler emits (fully reactive):
<div class={() => count() > 0 ? 'active' : ''}>{() => doubled()}</div>
```

This makes Pyreon the first signal framework where JSX looks like plain JavaScript. The feature is:

- **Scope-aware** — inner variables that shadow a signal name are NOT auto-called
- **Cross-module** — the Vite plugin pre-scans all files for `export const x = signal(...)` exports and resolves imports
- **Safe** — already-called signals (`count()`) are NOT double-called; `import type` is excluded

### How It Works

Dynamic expressions in JSX are wrapped in arrow functions so the Pyreon runtime can re-evaluate them when their dependencies change:

```tsx
// Input (explicit calls — also works)
<div class={active() ? "on" : "off"}>{count()}</div>

// Output
<div class={() => active() ? "on" : "off"}>{() => count()}</div>
```

The wrapping applies to both child expressions and prop values on DOM elements (lowercase tags).

### The `shouldWrap` Decision Tree

The compiler uses a precise set of rules (`isDynamic`/`shouldWrap` in `jsx.ts`) to determine whether an expression needs reactive wrapping. The decision tree is:

1. **Is it an arrow function or function expression?** -- Skip. The user explicitly wrapped it or it is a callback.
2. **Is it a static literal?** -- Skip. String literals, numeric literals, template literals without substitutions, `true`, `false`, `null`, and `undefined` have no reactive dependencies.
3. **Does it contain a call expression?** -- Wrap it, **unless** the call is on a small allowlist of "pure static" globals (`Math.floor`, `Number.parseInt`, `JSON.stringify`, `Array.isArray`, `parseInt`, `encodeURIComponent`, `Date.now`, …) with only literal arguments — those are treated as one-time computations, not reactive dependencies. `String(...)`/`Number(...)`/`Boolean(...)` coercion calls are transparent: whether the call is dynamic depends only on whether their *argument* is (`String(row.id)` stays static, `String(count())` is dynamic). Every other call expression, and any `TaggedTemplateExpression`, is treated as reactive.
4. **Is it a component-prop member access** (`props.x`, or a `const` derived from `props`/`splitProps` — see [Reactive Props Inlining](#reactive-props-inlining))? -- Wrap it. This is the case most people miss: `props.title` has **no call at all**, but it's still dynamic, because `props.title` is a live getter installed by `makeReactiveProps` — reading it once and caching the result would freeze it.
5. **Is it a bare reference to a signal/computed identifier that hasn't been called yet** (`count` instead of `count()`)? -- Wrap it **and auto-call it** (see [Signal Auto-Call](#signal-auto-call) above).
6. **Otherwise** -- Skip. Plain local identifiers, object/array literals, and member accesses on ordinary (non-props) variables are left as-is.

```tsx
// ---- WRAPPED ----
<div>{count()}</div>                    // → {() => count()}
<div>{a() ? "yes" : "no"}</div>        // → {() => a() ? "yes" : "no"}
<div>{show() && <span />}</div>        // → {() => show() && <span />}
<div>{count() + 1}</div>               // → {() => count() + 1}
<div>{`hello ${name()}`}</div>         // → {() => `hello ${name()}`}
<div>{obj.getValue()}</div>            // → {() => obj.getValue()}
<div>{items().map(x => x)}</div>       // → {() => items().map(x => x)}
<div>{store.getState().count}</div>    // → {() => store.getState().count}
<div>{css`color: red`}</div>           // → {() => css`color: red`} (tagged template)
<div>{count}</div>                     // → {() => count()} (bare signal, auto-called)

function C(props) {
  return <div>{props.title}</div>      // → props.title is dynamic even with NO call —
}                                       //   it's a live getter, wrapped as a reactive text bind

// ---- NOT WRAPPED (no reactive dependency) ----
<div>{"literal"}</div>                  // Static string literal
<div>{42}</div>                         // Static numeric literal
<div>{true}</div>                       // Static boolean
<div>{null}</div>                       // Static null
<div>{undefined}</div>                  // Static undefined
<div>{`hello`}</div>                    // Template literal without substitutions
<div>{title}</div>                      // Plain identifier — NOT a props member, NOT a signal
<div>{a ? b : c}</div>                  // Ternary without calls or props access
<div>{show && <span />}</div>          // Logical expression without calls or props access
<div>{{ color: "red" }}</div>           // Object literal without calls
<div>{[1, 2, 3]}</div>                 // Array literal without calls
<div>{obj.value}</div>                 // Member access on a plain (non-props) variable
<div>{a + b}</div>                     // Binary expression without calls
<div>{Math.floor(4.9)}</div>           // Pure-static call with literal args
<div>{() => count()}</div>             // Already an arrow function
<div>{function() { return x }}</div>   // Already a function expression
<div>{(x: number) => x + 1}</div>     // Arrow function with params
```

:::warning{title="A helper function call is conservatively treated as dynamic too"}
Rule 3 is broader than "signal reads" suggests: **any** call expression that isn't on the pure-static allowlist is wrapped, not just direct signal calls. `<div>{someHelper()}</div>` wraps reactively even if `someHelper` is an ordinary function with no signal reads inside it — the compiler can't see through an arbitrary function body, so it conservatively assumes the call might be dynamic. The one shape that actually goes static is capturing a value into a plain `const`/`let` *before* the JSX and referencing that binding instead — see [Reactivity Rules → Reading a signal to pass as static value](/docs/reactivity-rules#reading-a-signal-to-pass-as-static-value).
:::

### Component vs DOM Element Props

Both DOM elements (lowercase tags like `div`, `span`) and component elements (uppercase tags like `MyComp`) wrap dynamic props by the same `shouldWrap`/`isDynamic` test — a dynamic prop is **never left as a plain value on either kind of element**. What differs is the *shape* of the wrapping, because the two run through different reactivity plumbing:

- A **DOM element** prop is wrapped in a bare arrow — `class={() => cls()}` — and applied by `renderEffect`/the template bind function directly against the element.
- A **component** prop is wrapped in `_rp(() => expr)` (or the faster `_rpd(signal)` form when the value is a bare signal call with nothing else around it) — a marker the runtime's `makeReactiveProps` converts into a property **getter** on the props object the component receives. That's the mechanism behind "access `props.title`, don't destructure": the getter *is* the live binding.

```tsx
// DOM element: bare-arrow wrap
<div class={cls()}>            // → class={() => cls()}
<div title={getTitle()}>       // → title={() => getTitle()}
<div data-id={getId()}>        // → data-id={() => getId()}
<div aria-label={getLabel()}>  // → aria-label={() => getLabel()}

// Component element: _rp()/_rpd() getter-marker wrap — NOT left unchanged
<MyComponent value={count()} />  // → value={_rpd(count)}         (bare signal call — fast path)
<Button label={getText()} />     // → label={_rp(() => getText())} (general expression)

// Static / already-function-valued props are still left alone on both:
<MyComponent value="static" />           // unchanged — no reactive dependency
<Button onClick={() => doThing()} />     // unchanged — already a function (and `on*` is never wrapped, see below)
```

This distinction is made by checking the first character of the tag name. Uppercase tags are treated as components; lowercase tags as DOM elements.

Children in expression containers on components are still wrapped, since the runtime processes them as DOM content:

```tsx
<MyComponent>{count()}</MyComponent>
// → <MyComponent>{() => count()}</MyComponent>
```

### Special Props That Are Never Wrapped

Certain props are always excluded from wrapping regardless of their content:

| Prop                                      | Reason                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `key`                                     | Used for reconciliation identity, not a DOM attribute                       |
| `ref`                                     | A callback ref or ref object, not a reactive value                          |
| `onClick`, `onInput`, `onMouseEnter`, ... | Event handlers (any prop matching `/^on[A-Z]/`) are callbacks, not reactive |

```tsx
// These are NEVER wrapped:
<div key={id} />                            // key is identity
<div ref={myRef} />                         // ref is a callback
<button onClick={handleClick} />            // event handler
<button onClick={() => doSomething()} />    // event handler (arrow)
<input onInput={handler} />                 // event handler
<input onFocus={handler} />                 // event handler
<input onChange={handler} />                // event handler
<div onMouseEnter={fn} />                   // event handler
```

### Spread Attributes

Spread attributes on a **DOM element** are left unchanged by the compiler — reactivity for a DOM-element spread is handled entirely at the runtime layer (`_applyProps`/`_bindSpread`, see [DOM-element spread is fully first-class](/docs/reactivity-rules)), not at the JSX call site:

```tsx
// Input
<div {...props} class={cls()} />

// Output — DOM spread unchanged, the co-existing dynamic `class` prop still wrapped
<div {...props} class={() => cls()} />
```

Spread attributes on a **component**, by contrast, ARE rewritten — the compiler wraps the spread source in `_wrapSpread()` so the object's getter-shaped reactive props survive a plain object spread (`{...source}` in JS re-copies VALUES, which would collapse a compiler-emitted getter to a static snapshot at the spread's call time):

```tsx
// Input
<MyComponent {...props} class={props.cls} />

// Output — component spread wrapped with _wrapSpread(), class prop wrapped with _rp()
<MyComponent {..._wrapSpread(props)} class={_rp(() => props.cls)} />
```

### Object and Array Literal Props

Object and array literals are not wrapped unless they contain a function call:

```tsx
// NOT wrapped — static object literal
<div style={{ color: "red" }} />

// WRAPPED — object contains a signal read
<div style={{ color: theme() }} />
// → style={() => ({ color: theme() })}
```

## Pass 2: Static VNode Hoisting

### How It Works

Fully static JSX expressions inside expression containers are hoisted to module scope. They are created once at module initialization, not per component instance:

```tsx
// Input
function App() {
  return <div>{<span>Hello</span>}</div>
}

// Output
const _$h0 = /*@__PURE__*/ <span>Hello</span>
function App() {
  return <div>{_$h0}</div>
}
```

Hoisted declarations include the `/*@__PURE__*/` annotation so bundlers can tree-shake them if unused.

### What Counts as "Static"

A JSX node is considered static if **all** of the following are true:

- All props are string literals, boolean shorthands, or expression containers with static literal values
- All children are text nodes, other static JSX elements, or expression containers with static values
- There are no spread attributes (`&#123;...props&#125;`)

```tsx
// ---- HOISTABLE (fully static) ----
<span>Hello</span>                    // Text-only child
<br />                                // Self-closing, no props
<span class="foo">text</span>        // String literal prop
<input disabled />                    // Boolean shorthand
<>text</>                             // Static fragment

// ---- NOT HOISTABLE (has dynamic parts) ----
<span class={cls()}>text</span>       // Dynamic prop
<span>{count()}</span>                // Dynamic child
<span {...props}>text</span>          // Spread attribute
<>{count()}</>                        // Dynamic fragment child
```

### Multiple Hoists

When multiple static JSX expressions appear in the same file, each gets an independent hoisted variable:

```tsx
// Input
<div>{<span>A</span>}{<span>B</span>}</div>

// Output
const _$h0 = /*@__PURE__*/ <span>A</span>
const _$h1 = /*@__PURE__*/ <span>B</span>
<div>{_$h0}{_$h1}</div>
```

### Performance Implications

Hoisting eliminates per-render VNode allocations for static subtrees. In a component that renders thousands of list items each containing a static icon or label, this avoids creating thousands of identical VNode objects on every render cycle. The `/*@__PURE__*/` annotation ensures dead code elimination in production builds.

## Pass 3: Template Emission

### How It Works

JSX element trees made of DOM elements (no components, no spread attributes) — including a single element like `<div>{x()}</div>` — are compiled to `_tpl()` calls instead of nested `h()` calls. The HTML string is parsed once via `<template>.innerHTML`, then `cloneNode(true)` for each instance. For sole-dynamic-text children the template bakes a single space (`<span> </span>`) so the text node already exists in the clone — the bind function grabs it via `firstChild` and subscribes with `_bindText`:

```tsx
// Input
;<div class="box"><span>{text()}</span></div>

// Output
import { _tpl, _bindText } from '@pyreon/runtime-dom'

_tpl('<div class="box"><span> </span></div>', (__root) => {
  const __e0 = __root.firstElementChild
  const __t1 = __e0.firstChild
  const __d0 = _bindText(text, __t1)
  return () => {
    __d0()
  }
})
```

### Eligibility Rules

A JSX tree is eligible for template emission when:

| Condition                                      | Eligible? | Reason                                         |
| ---------------------------------------------- | --------- | ---------------------------------------------- |
| 1+ DOM elements, all lowercase tags            | Yes       | Pure DOM tree — single elements (`<div>{x()}</div>`) emit `_tpl()` too |
| Contains component (`<MyComp />`)              | No        | Components need runtime instantiation          |
| Has spread attributes (`&#123;...props&#125;`) | No        | Spread requires dynamic prop application — handled by `_tpl()` + `_applyProps()` on root elements, `h()` otherwise |
| Has `key` prop                                 | No        | Keyed elements need reconciliation metadata    |
| Contains fragment child (`<>...</>`)           | Yes       | Fragments are transparently flattened into the parent's template — static or dynamic content inside makes no difference |
| Mixed element + expression children            | Yes       | `<!>` comment placeholder + `_textSlot`/`_mountSlot` keeps positions exact |
| Multiple expression children in same parent    | Yes       | Text-only runs fuse into ONE `_fuse(...)` binding; a run touching an element sibling gets one `<!>` placeholder per expression |
| A ternary/logical expression whose branches are nested JSX (`{cond() ? <span/> : null}`) | Yes       | The condition routes through `_mountSlot`; the OUTER tree stays `_tpl()`-eligible — only the conditional's own subtree is unwrapped `h()`-style JSX |
| A BARE (unconditional, not wrapped in a ternary/logical/arrow) nested JSX expression child (`{<span>{x()}</span>}`) | No        | Too complex for template codegen — the entire outer tree falls back to `h()` |

### What Gets Baked Into HTML

Static parts of the template are baked directly into the HTML string, avoiding any runtime prop application:

```tsx
// Input
<input disabled />
<span>Static text</span>

// The HTML string contains all static attributes and text:
// "<div class=\"container\"><input disabled><span>Static text</span></div>"
```

The compiler handles JSX-to-HTML attribute mapping automatically:

| JSX Attribute | HTML Attribute |
| ------------- | -------------- |
| `className`   | `class`        |
| `htmlFor`     | `for`          |

```tsx
// Input
<div className="box">
  <label htmlFor="name">Name</label>
</div>

// HTML string: <div class="box"><label for="name">Name</label></div>
```

### Dynamic Bindings in Templates

Dynamic attributes and text content are handled by the bind function:

**Reactive attributes** subscribe directly via `_bindDirect()`, delegating the actual DOM write to the **same normalizer functions the `h()`/runtime path uses** (`_setClass`, `_setStyle`, `_setAttr`) so a compiled attribute and a component-rendered one apply a value identically — this is a deliberate, load-bearing design point: a divergence here was a real historical bug class (see [Reactivity Rules](/docs/reactivity-rules) and the [anti-patterns catalog](https://github.com/pyreon/pyreon/blob/main/.agents/rules/anti-patterns.md) for the "compiler template fast-path value emit diverging from runtime applyProp normalization" writeup):

```tsx
// Input
;<div class={cls()}>
  <span>{name()}</span>
</div>

// Output bind function:
;(__root) => {
  const __d0 = _bindDirect(cls, (v) => _setClass(__root, v))
  const __e0 = __root.firstElementChild
  const __t1 = __e0.firstChild
  const __d1 = _bindText(name, __t1)
  return () => {
    __d0()
    __d1()
  }
}
```

**One-time static expressions** (no calls, so not reactive) are set once via the runtime's `_setChild` helper, not `.textContent`:

```tsx
// Input
;<div>
  <span>{label}</span>
</div>

// Output bind function:
;(__root) => {
  const __e0 = __root.firstElementChild
  _setChild(__e0, label)
  return null
}
```

**Event handlers** use the runtime's delegation slots for delegated events (click, input, etc.), `addEventListener` otherwise:

```tsx
// Input
;<div>
  <button onClick={handler}>click</button>
</div>

// Output bind function:
;(__root) => {
  const __e0 = __root.firstElementChild
  __e0.__ev_click = handler
  return null
}
```

The event name is the full-lowercased prop name (`onMouseEnter` → `"mouseenter"`), with `onDoubleClick` remapped to `"dblclick"` via `REACT_EVENT_REMAP`.

**Ref props** support both object refs (`.current` assignment) and callback refs:

```tsx
// Input
;<div>
  <input ref={myRef} />
</div>

// Output bind function:
;(__root) => {
  const __e0 = __root.firstElementChild
  { const __r = myRef; if (typeof __r === 'function') __r(__e0); else if (__r) __r.current = __e0 }
  return null
}
```

### Reactive Text Nodes

For dynamic text content, the compiler binds a persistent `TextNode` and updates its `.data` property rather than setting `.textContent` on the parent. This avoids destroying and recreating the text node on every reactive update. There are three shapes, depending on the children of the element:

**Sole dynamic child, nothing else** (`<span>{name()}</span>`) — a SINGLE child that's an expression, no sibling text. The template bakes a single space so the text node already exists in the clone; the bind function grabs it via `firstChild` and calls `_bindText` directly on the signal for the O(1) fast path (no wrapping closure):

```tsx
// template HTML: "<span> </span>"
const __t0 = __e0.firstChild
const __d0 = _bindText(name, __t0)
```

**Text mixed with one or more expressions, no element siblings — TEXT FUSION** (`<span>Count: {count()}</span>`, or `<span>{a()}{b()}</span>`, or `<span>Count: {count()} items</span>`) — this is the common case, and it's handled entirely differently from the sole-child case above: the compiler **fuses** every literal text run and expression into ONE combined accessor call, `_fuse(...)` from `@pyreon/core`, bound via `bindPolymorphicText` on a SINGLE text node. There's no `<!>` placeholder and no `replaceChild` — the whole run collapses to the template's usual "bake a single space" shape:

```tsx
// Input: <span>Count: {count()} items</span>
// template HTML: "<span> </span>"  (same single-space bake as the sole-child case)
const __t0 = __root.firstChild
const __d0 = bindPolymorphicText(() => _fuse("Count: ", count(), " items"), __t0, __root)
```

`_fuse` joins the parts into a single string when every part is text-ish (`null`/`undefined`/`false` contribute nothing, everything else stringifies) — but the moment ANY part is a VNode/array/NativeItem/function, it returns the **parts array instead**, and `bindPolymorphicText` mounts that as a subtree. So `{sig()}` holding a VNode inside a fused run still mounts correctly; nothing gets coerced to `[object Object]`. Fusion is declined (falling back to the placeholder mechanism below) when a text run contains an HTML entity (`&nbsp;`, `&amp;`, …) — JSX decodes entities at parse time into the baked HTML string, but a fused run assigns `Text.data` directly, which never decodes anything, so the compiler bails rather than risk emitting the literal escaped text.

**Text/expression mixed with an ELEMENT sibling** (`<div><span>1</span>{count()}</div>`) — fusion requires every child to be text or an expression; an element in the mix breaks that, so this falls back to the older placeholder mechanism: the template bakes a `<!>` comment at the expression's position, and the bind function resolves a real text node over it via the runtime's `_textSlot(parent, placeholder)` helper (which also knows how to adopt an already-hydrated server text node in place, rather than rebuilding it — see [Hydration](/docs/runtime-dom#hydration)):

```tsx
// template HTML: "<div><span>1</span><!></div>"
const __p0 = __root.firstChild.nextSibling  // the <!> placeholder
const __t0 = _textSlot(__root, __p0)
const __d0 = _bindText(count, __t0)
```

### Cleanup / Disposal

The bind function returns a cleanup function that disposes all reactive bindings. When no dynamic bindings exist, it returns `null`:

```tsx
// No dynamic parts → null cleanup
_tpl('<div><span>static</span></div>', () => null)

// Multiple dynamic parts → composed cleanup
_tpl('...', (__root) => {
  const __d0 = _bindDirect(cls, (v) => _setClass(__root, v))
  const __d1 = _bindText(name, __t0)
  return () => {
    __d0()
    __d1()
  }
})
```

### Element Access Paths

The bind function accesses child elements using `firstElementChild` / `nextElementSibling` chains from the root:

```tsx
// Input
<div>
  <span>{a()}</span>
  <em>{b()}</em>
</div>

// Paths:
// __root                                        → <div>
// __root.firstElementChild                      → <span>
// __root.firstElementChild.nextElementSibling   → <em>
```

For deeply nested structures, paths chain through each level:

```tsx
// Input
<table>
  <tbody>
    <tr>
      <td>{text()}</td>
    </tr>
  </tbody>
</table>

// Paths chain: __root.firstElementChild.firstElementChild.firstElementChild → <td>
```

### Void Elements

HTML void elements (`br`, `img`, `input`, `hr`, etc.) are emitted without closing tags in the HTML string:

```tsx
// Input
<div>
  <br />
  <span>text</span>
</div>

// HTML string: "<div><br><span>text</span></div>"
// Note: <br> not </br>
```

The full list of recognized void elements: `area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `param`, `source`, `track`, `wbr`.

### Auto-Imported Runtime Helpers

When template emission is used, the compiler automatically prepends import statements for whichever helpers the emitted bind functions actually call — never more than that. There isn't one fixed set: a template with only a dynamic class emits `_bindDirect` + `_setClass`; one with a text-fusion run also emits `_fuse` from `@pyreon/core`; one with a bare `props.x` text child emits `_bindProp`. A representative (non-exhaustive) import for a template mixing several of these shapes:

```ts
import { _fuse } from '@pyreon/core'
import { _tpl, _bindText, _bindDirect, _bindProp, bindPolymorphicText, _setClass, _setChild } from '@pyreon/runtime-dom'
```

These imports are only added when at least one `_tpl()` call is emitted, and each helper only when used. The `usesTemplates` flag on the transform result indicates whether any template was emitted at all.

### Performance Benefits

Template emission provides significant performance improvements:

- **`cloneNode(true)` is 5-10x faster** than sequential `createElement` + `setAttribute` calls
- **Zero VNode, props-object, or children-array allocations** per instance
- **Static attributes are baked into the HTML string** -- no runtime prop application needed
- **Direct subscriptions, not effects** -- `_bindText`/`_bindDirect`/`_bindProp` subscribe straight to a signal's O(1) direct-dispatch tier when the source allows it, skipping the `renderEffect` machinery entirely; only genuinely polymorphic/derived expressions fall back to the general `bindPolymorphicText` path
- **Text fusion collapses multi-part text into ONE binding** -- `<span>Count: {count()} items</span>` is one `_fuse(...)` call and one text-node subscription, not a static-bake-plus-placeholder pair (see [Reactive Text Nodes](#reactive-text-nodes))
- **Persistent `TextNode` reuse** avoids destroy/recreate overhead on text updates

### Real-World Template: Benchmark Row

Here is a realistic `<For>`-row-callback example (the shape `js-framework-benchmark`-style row components take) showing several template features working together — a dynamic class, a one-time-static prop read, and a reactive method-call text binding:

```tsx
// Input — row is a <For> render-callback param, NOT a component's props
// (the compiler deliberately does not treat a <For> callback param as
// reactive props — see Reactivity Rules)
;<tr class={cls()}>
  <td class="id">{String(row.id)}</td>
  <td>{row.label()}</td>
</tr>

// Output
_tpl('<tr><td class="id"></td><td> </td></tr>', (__root) => {
  const __e0 = __root.firstElementChild
  const __e1 = __e0.nextElementSibling
  const __t2 = __e1.firstChild
  const __d0 = _bindDirect(cls, (v) => _setClass(__root, v))
  _setChild(__e0, String(row.id)) // row.id is a per-item value with no calls — set once
  const __d1 = _bindText(row.label, __t2, undefined, row) // method call — bound with `row` as receiver
  return () => {
    __d0()
    __d1()
  }
})
```

Static class `"id"` is baked into the HTML. Dynamic class `cls()` binds via `_bindDirect` + `_setClass`. `row.label()` is a member-call, so `_bindText` takes a 4th `receiver` argument (`row`) instead of eagerly building a wrapping closure — the receiver-binding closure is only constructed lazily, on the binding's slow path, never per fire.

:::note{title="This is a <For> callback — inside an ordinary component, row.id would be reactive"}
If `row` were instead a destructured/direct reference to a *component's* `props` parameter (`function Row(row) { ... }`), `row.id` would be a **component-prop member access** — dynamic per rule 4 of the `shouldWrap` decision tree above — and `String(row.id)` would compile to a reactive `bindPolymorphicText(() => String(row.id), ...)` binding instead of a one-time `_setChild`. The `<For>` render-callback param is the one deliberate exception: it's the framework's per-row VALUE, not reactive props, so a plain per-item read stays a one-time set.
:::

## Compiler Warnings

The compiler emits warnings for common mistakes. Warnings are returned in the `warnings` array on the transform result.

### `missing-key-on-for`

Emitted when a `<For>` component is used without a `by` prop:

```tsx
// Triggers warning:
<For each={() => items()}>{(item) => <li>{item.name}</li>}</For>

// Fix:
<For each={() => items()} by={(item) => item.id}>
  {(item) => <li>{item.name}</li>}
</For>
```

Without `by`, the runtime falls back to index-based diffing, which is slower and can cause bugs with stateful children.

### Warning Types

```ts
interface CompilerWarning {
  message: string
  line: number // 1-based line number
  column: number // 0-based column number
  code:
    | 'signal-call-in-jsx'
    | 'missing-key-on-for'
    | 'signal-in-static-prop'
    | 'circular-prop-derived'
    | 'duplicate-jsx-attr'
    | 'plain-mode'
}
```

Currently-emitted codes:

| Code                   | When it fires                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `missing-key-on-for`    | A `<For>` with no `by` prop (see above).                                                                  |
| `circular-prop-derived` | A prop-derived `const` chain that references itself (`const a = b + props.x; const b = a + 1`). The cyclic identifier keeps its captured value instead of being reactively inlined — restructure the chain or read `props.*` directly. |
| `duplicate-jsx-attr`    | The same JSX attribute name written twice on one element (`<div id="a" id="b" />`). The later one wins (matches JS object-literal semantics), the earlier one is flagged as ignored. |
| `plain-mode`            | Emitted by the [Plain Mode](/docs/plain-mode) pre-pass for a declined/unconvertible shape — prefixed with `[plain]` in the message. |

`signal-call-in-jsx` and `signal-in-static-prop` are declared in the type but are not currently emitted by either backend — reserved for future diagnostics. Don't build tooling that assumes they fire today.

## API Reference

### `transformJSX(code, filename?)`

The main API. Transforms JSX source code, applying reactive wrapping, static hoisting, and template emission.

```ts
import { transformJSX } from '@pyreon/compiler'

const result = transformJSX(code, 'MyComponent.tsx')

console.log(result.code) // Transformed source code
console.log(result.usesTemplates) // true if _tpl() was emitted
console.log(result.warnings) // Array of compiler warnings
```

**Parameters:**

- **`code`** (`string`) -- The JSX source code to transform.
- **`filename`** (`string`, optional) -- The filename for parser context. Defaults to `"input.tsx"`. All files are parsed as TSX regardless of extension.

**Returns:** `TransformResult`

### `TransformResult`

```ts
interface TransformResult {
  /** Transformed source code (JSX preserved, only expression containers modified) */
  code: string
  /** Whether the output uses _tpl/_bind template helpers (needs auto-import) */
  usesTemplates?: boolean
  /** Compiler warnings for common mistakes */
  warnings: CompilerWarning[]
}
```

### `CompilerWarning`

```ts
interface CompilerWarning {
  /** Warning message */
  message: string
  /** Source file line number (1-based) */
  line: number
  /** Source file column number (0-based) */
  column: number
  /** Warning code for filtering */
  code:
    | 'signal-call-in-jsx'
    | 'missing-key-on-for'
    | 'signal-in-static-prop'
    | 'circular-prop-derived'
    | 'duplicate-jsx-attr'
    | 'plain-mode'
}
```

See [Warning Types](#warning-types) above for what each currently-emitted code means.

## Complete Transform Rules Reference

| Pattern                                     | Transform                            | Reason                               |
| ------------------------------------------- | ------------------------------------ | ------------------------------------ |
| `<div>&#123;expr()&#125;</div>`             | `&#123;() => expr()&#125;`           | Dynamic child with signal read       |
| `<div :class='expr()'>`                     | `class=&#123;() => expr()&#125;`     | Dynamic prop with signal read        |
| `<div>&#123;a() ? b : c&#125;</div>`        | `&#123;() => a() ? b : c&#125;`      | Ternary containing a call            |
| `<div>&#123;show() && x&#125;</div>`        | `&#123;() => show() && x&#125;`      | Logical expression containing a call |
| `<div>&#123;count() + 1&#125;</div>`        | `&#123;() => count() + 1&#125;`      | Binary expression containing a call  |
| ``<div>&#123;`hi ${name()}`&#125;</div>``   | ``&#123;() => `hi ${name()}`&#125;`` | Template literal containing a call   |
| `<div>&#123;obj.get()&#125;</div>`          | `&#123;() => obj.get()&#125;`        | Method call                          |
| ``<div>&#123;css`...`&#125;</div>``         | `{() => css`...`}`                   | Tagged template expression           |
| `<button :onClick='fn'>`                    | Unchanged                            | Event handler                        |
| `<div :key='id'>`                           | Unchanged                            | Key prop                             |
| `<div :ref='r'>`                            | Unchanged                            | Ref prop                             |
| `<div>&#123;() => expr()&#125;</div>`       | Unchanged                            | Already wrapped                      |
| `<div>&#123;"literal"&#125;</div>`          | Unchanged                            | Static string                        |
| `<div>&#123;42&#125;</div>`                 | Unchanged                            | Static number                        |
| `<div>&#123;true&#125;</div>`               | Unchanged                            | Static boolean                       |
| `<div>&#123;null&#125;</div>`               | Unchanged                            | Static null                          |
| `<div>&#123;undefined&#125;</div>`          | Unchanged                            | Static undefined                     |
| `<div>&#123;identifier&#125;</div>`         | Unchanged                            | Plain identifier (no call)           |
| `<div>&#123;&#123; x: 1 &#125;&#125;</div>` | Unchanged                            | Object literal (no call)             |
| `<div>&#123;[1, 2]&#125;</div>`             | Unchanged                            | Array literal (no call)              |
| `<div>&#123;a + b&#125;</div>`              | Unchanged                            | Binary expression (no call)          |
| `<div>&#123;a ? b : c&#125;</div>`          | Unchanged                            | Ternary (no call)                    |
| `<Comp :prop='expr()'>`                     | `prop={_rp(() => expr())}`           | Component prop — wrapped with a getter marker, NOT the same bare-arrow form DOM props get |
| `<Comp :prop='sig()'>` (bare signal call)   | `prop={_rpd(sig)}`                   | Component prop, bare-signal fast path |
| `<div>&#123;<span>text</span>&#125;</div>`  | Hoisted to module scope              | Static JSX child                     |
| `<div><span>&#123;t()&#125;</span></div>`   | `_tpl(...)` call                     | Template-eligible tree (2+ elements) |
| `<div &#123;...props&#125;>`                | Unchanged                            | DOM-element spread left as-is (handled by the runtime's `_applyProps`/`_bindSpread`, not the compiler) |
| `<Comp &#123;...props&#125;>`               | `{..._wrapSpread(props)}`            | Component spread wrapped so getter-shaped reactive props survive the JS object spread |

## Integration with Vite Plugin

The compiler is used automatically by `@pyreon/vite-plugin`. For custom integrations, call `transformJSX` in your build tool's transform hook:

```ts
import { transformJSX } from '@pyreon/compiler'

function myBuildPlugin() {
  return {
    name: 'my-pyreon-transform',
    transform(code: string, id: string) {
      if (id.endsWith('.tsx') || id.endsWith('.jsx') || id.endsWith('.pyreon')) {
        const result = transformJSX(code, id)

        // Log any warnings
        for (const warning of result.warnings) {
          console.warn(`[pyreon] ${id}:${warning.line}:${warning.column} ${warning.message}`)
        }

        return { code: result.code, map: null }
      }
    },
  }
}
```

### Webpack Loader Example

```ts
import { transformJSX } from '@pyreon/compiler'

export default function pyreonLoader(source: string) {
  const result = transformJSX(source, this.resourcePath)

  for (const warning of result.warnings) {
    this.emitWarning(new Error(warning.message))
  }

  return result.code
}
```

### Rollup Plugin Example

```ts
import { transformJSX } from '@pyreon/compiler'

export default function pyreonPlugin() {
  return {
    name: 'pyreon-compiler',
    transform(code: string, id: string) {
      if (!/\.[jt]sx$/.test(id)) return null

      const result = transformJSX(code, id)

      if (result.warnings.length > 0) {
        for (const w of result.warnings) {
          this.warn({ message: w.message, id, pos: { line: w.line, column: w.column } })
        }
      }

      return { code: result.code, map: null }
    },
  }
}
```

## Reactive Props Inlining

The compiler auto-detects when `const` variables are derived from `props.*` or `splitProps` results and inlines them at JSX use sites, making them automatically reactive.

### The Problem

In Pyreon, components run once. A plain variable assignment from props captures the value at setup time — it does not track future changes:

```tsx
// Before this feature — x was static:
function Greeting(props) {
  const x = props.name ?? 'World'
  return <div>{x}</div>  // never updated when props.name changed
}
```

### The Solution

The compiler now traces `const` declarations back to their props origin and inlines the original expression at each JSX use site:

```tsx
// Input
function Greeting(props) {
  const x = props.name ?? 'World'
  return <div>{x}</div>
}

// Compiler output (template mode):
_tpl('<div> </div>', (__root) => {
  const __t0 = __root.firstChild
  const __d0 = bindPolymorphicText(() => (props.name ?? 'World'), __t0, __root)
  return __d0
})
```

The variable `x` is replaced with its original expression `(props.name ?? 'World')` inside a reactive text binding, so it re-evaluates whenever `props.name` changes.

### Transitive Resolution

The compiler resolves chains of `const` assignments transitively:

```tsx
function Profile(props) {
  const name = props.name
  const greeting = name + '!'
  const upper = greeting.toUpperCase()
  return <div>{upper}</div>
}

// Compiler inlines upper into a reactive text binding as:
// bindPolymorphicText(() => (((props.name) + '!').toUpperCase()), textNode, root)
// → fully reactive to props.name changes
```

### Rules

| Condition | Inlined? | Reason |
| --- | --- | --- |
| `const x = props.y` | Yes | Direct props member access |
| `const x = props.y ?? 'default'` | Yes | Expression containing props access |
| `const [own, rest] = splitProps(props, ['y'])` then `const x = own.y` | Yes | splitProps results are tracked |
| `const a = props.x; const b = a + 1` | Yes | Transitive resolution |
| `let x = props.y` | No | `let` is mutable — unsafe to inline |
| `var x = props.y` | No | `var` is mutable — unsafe to inline |
| `console.log(x)` where `x` is prop-derived | No | Non-JSX usage stays static (captured value) |

### Non-JSX Usage

The inlining only applies to JSX text and attribute positions. Using a prop-derived variable in regular JavaScript code (e.g., `console.log(x)`, passing to a function) still uses the captured value. This is correct — those contexts are not reactive scopes:

```tsx
function MyComponent(props) {
  const label = props.label ?? 'default'

  console.log(label)          // ✓ Correct — logs the setup-time value
  return <div>{label}</div>   // ✓ Reactive — compiler inlines props.label ?? 'default'
}
```

## Per-Text-Node Independent Bindings

Each reactive text node in a template gets its own independent binding. Previously, multiple text bindings could share a single `_bind()`, meaning a change in one signal would re-evaluate all bindings in the group. Now each text node tracks only its own dependencies:

```tsx
// Input
<div>
  <span>{firstName()}</span>
  <span>{lastName()}</span>
</div>

// Output — each text node has its own binding:
_tpl('<div><span> </span><span> </span></div>', (__root) => {
  const __e0 = __root.firstElementChild
  const __t1 = __e0.firstChild
  const __d0 = _bindText(firstName, __t1)
  const __e2 = __root.firstElementChild.nextElementSibling
  const __t3 = __e2.firstChild
  const __d1 = _bindText(lastName, __t3)
  return () => { __d0(); __d1() }
})
```

Changing `firstName` only re-executes `__d0`, not `__d1`. This is fine-grained reactivity at the individual text node level.

## Auto-promoted Fast Paths

For canonical reactive patterns the compiler emits an **effect-free** subscription instead of the default `_bind(() => …)` wrap. Same observed behaviour, ~5 → ~2 allocations per binding, no `renderEffect` machinery setup. Three shapes are auto-promoted today; all share the same conservative bail catalog (uncertain ⇒ no promotion).

### `selector(k) ? a : b` ternary in className/attr bindings (PR #898)

```tsx
const isSelected = createSelector(selectedId)
;<For each={rows} by={(r) => r.id}>
  {(row) => <tr class={() => isSelected(row.id) ? 'selected' : ''}>...</tr>}
</For>

// Compiles to (effect-free per-key fast path):
const __d0 = isSelected.subscribe(row.id, (m) => {
  _setClass(__root, m ? 'selected' : '')
})

// Instead of the default _bind(() => …) shape:
const __d0 = _bind(() => {
  _setClass(__root, isSelected(row.id) ? 'selected' : '')
})
```

The runtime API (`createSelector.subscribe`) ships with `@pyreon/reactivity` 0.25+. The promoted updater receives a boolean and applies the ternary inline; only the deselected and newly-selected rows re-run on selection change, never the entire `<For>` list.

### `selector(k) ? a : b` ternary as a text-child (PR #899)

```tsx
<For each={rows} by={(r) => r.id}>
  {(row) => <td>{() => isSelected(row.id) ? '✓' : ''}</td>}
</For>

// Compiles to:
const __d0 = isSelected.subscribe(row.id, (m) => {
  __t0.data = (m ? '✓' : '')
})
```

Companion to the className path — same detector, different emission target. Common in row checkmark / badge columns of selection-bound tables.

### `signalRef().method(...args)` formatter in text-child bindings (PR #899)

```tsx
const count = signal(0)
const name = signal('hello')
;<span>{count().toFixed(2)}</span>
;<h2>{name().toUpperCase()}</h2>
;<code>{n().toString(16)}</code>

// Compile to (subscribes directly to the signal, applies formatter in updater):
const __d0 = _bindDirect(count, (v) => { __t0.data = v.toFixed(2) })
const __d1 = _bindDirect(name, (v) => { __t1.data = v.toUpperCase() })
const __d2 = _bindDirect(n, (v) => { __t2.data = v.toString(16) })
```

Detects `signalRef().method(...staticArgs)` where the method is in a curated safelist of pure Number / String / Boolean prototype methods (`toFixed`, `toExponential`, `toPrecision`, `toString`, `valueOf`, `toUpperCase`, `toLowerCase`, `toLocaleUpperCase`, `toLocaleLowerCase`, `trim`, `trimStart`, `trimEnd`, `slice`, `substring`, `substr`, `charAt`, `charCodeAt`, `codePointAt`, `padStart`, `padEnd`, `repeat`, `normalize`, `concat`, `startsWith`, `endsWith`, `includes`, `indexOf`, `lastIndexOf`, `at`). The safelist is intentionally narrow — methods that mutate (`Array.sort`) or depend on call-time state are excluded.

### Bail catalog (same shape for all three)

Auto-promotion falls back to `_bind(...)` when:
- The receiver isn't a known signal or `createSelector()` result (tracked at module scope via `signalVars` / `selectorVars` — same scope-awareness as signal auto-call)
- The selector call has 0 or 2+ arguments (not the standard shape) / the method receiver has args
- The key, branch, or method args contain a reactive read
- The expression isn't a ternary (selector path) or method call (formatter path)
- The method callee is computed (`sig()["toFixed"](2)`)
- The expression chains methods (`sig().a().b()`)

### Dual-backend parity

Both the JS path and the Rust native binary implement all three detectors byte-for-byte. Cross-backend equivalence tests lock the parity so the two backends can't drift.

## Pure Static Call Detection

The compiler recognizes ~37 standard-library functions as "pure static" — a call to one of these, with only literal arguments, is treated as a one-time computation, not a reactive dependency:

```tsx
// NOT wrapped — Math.round with a literal arg is pure-static:
<div>{Math.round(3.7)}</div>

// STILL wrapped — the ARGUMENT is dynamic, so the call is treated as
// dynamic too (pure-static requires EVERY argument to be a literal):
<div>{Math.round(price())}</div>

// STILL wrapped — user function may contain signals:
<div>{formatPrice(price())}</div>
```

This is deliberately a small, curated allowlist, not a general purity inference — the compiler has no way to know whether an arbitrary function is side-effect-free, so it only special-cases global functions it can name explicitly:

- **Math**: `max`, `min`, `abs`, `floor`, `ceil`, `round`, `pow`, `sqrt`, `random`, `trunc`, `sign`
- **Number**: `Number.parseInt`, `Number.parseFloat`, `Number.isNaN`, `Number.isFinite`
- **Global**: `parseInt`, `parseFloat`, `isNaN`, `isFinite`
- **String**: `String.fromCharCode`, `String.fromCodePoint`
- **Object**: `Object.keys`, `Object.values`, `Object.entries`, `Object.assign`, `Object.freeze`, `Object.create`
- **Array**: `Array.from`, `Array.isArray`, `Array.of`
- **JSON**: `JSON.stringify`, `JSON.parse`
- **URI encoding**: `encodeURIComponent`, `decodeURIComponent`, `encodeURI`, `decodeURI`
- **Date**: `Date.now`

A SEPARATE, narrower rule handles the three coercion globals — `String(...)`, `Number(...)`, `Boolean(...)` with exactly one non-spread argument. These aren't checked against the allowlist above; instead the call is **transparent**, and dynamism is decided entirely by the argument: `String(row.id)` stays static (the argument has no reactive dependency), `String(count())` is dynamic (the argument does), `String(props.x)` is dynamic (props access is always dynamic — see the `shouldWrap` decision tree above). This is why `String(row.id)` inside a `<For>` render-callback body can safely be a one-time set, while a naive "String() is always pure" rule would have missed the reactive case.

## Spread Props on Root Element

When the root element of a template has spread attributes, the compiler now emits `_tpl()` + `_applyProps()` instead of falling back to `h()` calls. This preserves the performance benefits of template cloning:

```tsx
// Input
<div {...props}>
  <span>{text()}</span>
</div>

// Output — template cloning + _applyProps for spread:
_tpl('<div><span> </span></div>', (__root) => {
  const __e0 = __root.firstElementChild
  const __t1 = __e0.firstChild
  const __d0 = _applyProps(__root, props) // returns a disposer — captured like any other binding
  const __d1 = _bindText(text, __t1)
  return () => { __d0(); __d1() }
})
```

Previously, any spread attribute would bail out of template emission entirely and fall back to `h()` calls. Now only spreads on non-root elements cause bailout.

## Known Limitations

### Nested JSX in Expression Containers

Expressions inside nested JSX within a child expression container are not individually wrapped. They are still reactive because the outer wrapper re-evaluates the whole subtree, just at a coarser granularity:

```tsx
// The inner name() is NOT individually wrapped — but the outer () =>
// re-evaluates the entire subtree when show() changes.
<div>{() => show() && <span>{name()}</span>}</div>
```

Fine-grained nested wrapping is planned for a future pass.

### Fragment Children — no longer a limitation

**This used to bail out of template emission and no longer does.** A fragment is a transparent grouping construct (it has no DOM identity of its own), so the compiler flattens a fragment child directly into its parent — static or dynamic content inside it, either way — and still emits `_tpl()`:

```tsx
// Both of these emit _tpl() — the fragment is transparently flattened:
<div><>text</></div>
<div><span>a</span><>{count()}</></div>
```

A fragment still bails template emission the same way anything else does: if it contains a **component** child (`<div><><Comp/></></div>`), the whole tree falls back to `h()` — that's the component rule (below), not a fragment-specific limitation.

### Mixed Element and Expression Children — also no longer a limitation

A parent element with both element children and expression children **is** eligible for template emission — the compiler bakes a `<!>` comment placeholder at the expression's position and resolves a real text/element node over it at bind time via `_textSlot`/`_mountSlot` (see [Reactive Text Nodes](#reactive-text-nodes) above), so `childNodes` indexing stays exact:

```tsx
// Template-eligible — <!> placeholder keeps sibling positions exact:
<div><span />{text()}</div>

// Also template-eligible (expression-only children per parent):
<div><span>{text()}</span></div>
```

## Implementation Details

The compiler uses a **dual-backend architecture**:

- **Rust native binary** (`native/src/lib.rs`): the primary path, 3.7-8.9x faster. Uses `oxc_parser`/`oxc_ast` Rust crates for zero-copy AST traversal. Compiled to a platform-specific `.node` binary via napi-rs.
- **JS fallback** (`src/jsx.ts`): uses `oxc-parser` (Rust NAPI binding) for parsing + a JS reactive pass. Activated automatically when the native binary isn't available (CI, WASM environments, unsupported platforms).

Both backends collect positional string replacements, then apply them in a single left-to-right O(n) pass. Prop-derived variable resolution is fully AST-based — `collect_prop_derived_idents` walks `IdentifierReference` nodes in the expression subtree, never scanning source text. This prevents false matches inside string literals, comments, or template literal quasis.

The implementation is a single recursive walk that visits every node in the source file. Template emission is checked first to avoid double-processing elements that get compiled to `_tpl()` calls. When a template-eligible subtree is found, the entire subtree is replaced with a single `_tpl()` call and the walker does not recurse into it.

Performance (Pyreon reactive pass only):

| File size | JS fallback | Rust native | Speedup |
| --- | --- | --- | --- |
| Small (9 lines) | 112K ops/sec | 410K ops/sec | 3.7x |
| Medium (24 lines) | 12.6K ops/sec | 103K ops/sec | 8.2x |
| Large (500+ lines) | 309 ops/sec | 1,544 ops/sec | 5.0x |

### Native binary loader + per-platform packages

`transformJSX()` resolves the native binary in two steps via `loadNativeBinding()`:

1. **In-tree**: a same-OS-and-arch `.node` binary in `packages/core/compiler/native/` (workspace-internal builds, monorepo dev).
2. **Per-platform npm package**: `@pyreon/compiler-<platform>-<arch>[-<libc>]` declared as an `optionalDependency`. npm / bun installs only the matching one for the consumer's platform — package manifest expresses this via the `os` / `cpu` fields per platform package.

Currently published platform packages:

| Platform   | Arch    | libc   | Package                                |
| ---------- | ------- | ------ | -------------------------------------- |
| `darwin`   | `arm64` | —      | `@pyreon/compiler-darwin-arm64`        |
| `darwin`   | `x64`   | —      | `@pyreon/compiler-darwin-x64`          |
| `linux`    | `x64`   | `gnu`  | `@pyreon/compiler-linux-x64-gnu`       |
| `linux`    | `x64`   | `musl` | `@pyreon/compiler-linux-x64-musl`      |
| `linux`    | `arm64` | `gnu`  | `@pyreon/compiler-linux-arm64-gnu`     |
| `linux`    | `arm64` | `musl` | `@pyreon/compiler-linux-arm64-musl`    |
| `win32`    | `x64`   | —      | `@pyreon/compiler-win32-x64-msvc`      |

`detectLibc()` distinguishes glibc vs musl on Linux at load time (necessary because the wrong libc would silently fail to load, not throw). If neither path resolves (CI without the platform package, WASM, or a platform we don't ship for), the call falls through to the JS path silently — `transformJSX()` always returns a result.

To diagnose the resolved path in dev: set `DEBUG=pyreon:compiler` and the loader logs which path it took (in-tree, per-platform package, or JS fallback) on first call.

## Exports Summary

| Export                | Type     | Description                                               |
| --------------------- | -------- | --------------------------------------------------------- |
| `transformJSX`        | Function | Transform JSX source code (auto-selects native or JS)     |
| `transformJSX_JS`     | Function | JS-only path — bypasses the native binary                 |
| `loadNativeBinding`   | Function | Resolve the native `.node` binding (or `null` if absent)  |
| `TransformResult`     | Type     | Interface for the transform output                        |
| `CompilerWarning`     | Type     | Interface for compiler warning objects                    |
