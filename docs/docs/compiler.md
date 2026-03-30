---
title: "@pyreon/compiler"
description: JSX reactive transform that wraps dynamic expressions in reactive getters for fine-grained DOM updates.
---

`@pyreon/compiler` provides the JSX transform that makes Pyreon's fine-grained reactivity work. It analyzes JSX expressions at build time and wraps dynamic values in `() =>` arrow functions so the runtime receives reactive getters instead of eagerly-evaluated snapshots. It also performs static VNode hoisting and template emission for optimal DOM creation performance.

<PackageBadge name="@pyreon/compiler" href="/docs/compiler" />

## Installation

::: code-group

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

Each pass is applied during a single AST walk using the TypeScript parser. The compiler uses positional string replacements via an O(n) left-to-right string builder rather than full AST-to-code generation, keeping the output close to the original source and preserving source map compatibility.

## Pass 1: Reactive Wrapping

### How It Works

Dynamic expressions in JSX are wrapped in arrow functions so the Pyreon runtime can re-evaluate them when their dependencies change:

```tsx
// Input
<div class={active() ? "on" : "off"}>{count()}</div>

// Output
<div class={() => active() ? "on" : "off"}>{() => count()}</div>
```

The wrapping applies to both child expressions and prop values on DOM elements (lowercase tags).

### The `shouldWrap` Decision Tree

The compiler uses a precise set of rules to determine whether an expression needs reactive wrapping. The decision tree is:

1. **Is it an arrow function or function expression?** -- Skip. The user explicitly wrapped it or it is a callback.
2. **Is it a static literal?** -- Skip. String literals, numeric literals, template literals without substitutions, `true`, `false`, `null`, and `undefined` have no reactive dependencies.
3. **Does it contain a call expression?** -- Wrap it. Signal reads are always function calls (`count()`, `name()`). If the expression tree contains any `CallExpression` or `TaggedTemplateExpression`, it is treated as reactive.
4. **Otherwise** -- Skip. Plain identifiers, object literals, array literals, and member accesses without calls are left as-is.

```tsx
// ---- WRAPPED (contains function calls) ----
<div>{count()}</div>                    // → {() => count()}
<div>{a() ? "yes" : "no"}</div>        // → {() => a() ? "yes" : "no"}
<div>{show() && <span />}</div>        // → {() => show() && <span />}
<div>{count() + 1}</div>               // → {() => count() + 1}
<div>{`hello ${name()}`}</div>         // → {() => `hello ${name()}`}
<div>{obj.getValue()}</div>            // → {() => obj.getValue()}
<div>{items().map(x => x)}</div>       // → {() => items().map(x => x)}
<div>{store.getState().count}</div>    // → {() => store.getState().count}
<div>{css`color: red`}</div>           // → {() => css`color: red`} (tagged template)

// ---- NOT WRAPPED (no reactive dependency) ----
<div>{"literal"}</div>                  // Static string literal
<div>{42}</div>                         // Static numeric literal
<div>{true}</div>                       // Static boolean
<div>{null}</div>                       // Static null
<div>{undefined}</div>                  // Static undefined
<div>{`hello`}</div>                    // Template literal without substitutions
<div>{title}</div>                      // Plain identifier (no call)
<div>{a ? b : c}</div>                  // Ternary without calls
<div>{show && <span />}</div>          // Logical expression without calls
<div>{{ color: "red" }}</div>           // Object literal without calls
<div>{[1, 2, 3]}</div>                 // Array literal without calls
<div>{obj.value}</div>                 // Member access without call
<div>{a + b}</div>                     // Binary expression without calls
<div>{() => count()}</div>             // Already an arrow function
<div>{function() { return x }}</div>   // Already a function expression
<div>{(x: number) => x + 1}</div>     // Arrow function with params
```

### Component vs DOM Element Props

Props on DOM elements (lowercase tags like `div`, `span`) are wrapped in reactive getters when they contain signal reads. Props on component elements (uppercase tags like `MyComp`) are **not** wrapped -- components receive plain values and manage reactivity internally:

```tsx
// DOM element: props ARE wrapped
<div class={cls()}>          // → class={() => cls()}
<div title={getTitle()}>     // → title={() => getTitle()}
<div data-id={getId()}>      // → data-id={() => getId()}
<div aria-label={getLabel()}> // → aria-label={() => getLabel()}

// Component element: props are NOT wrapped
<MyComponent value={count()} />  // → value={count()} (unchanged)
<Button label={getText()} />     // → label={getText()} (unchanged)
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

Spread attributes (`&#123;...props&#125;`) are left unchanged by the compiler. They are not wrapped in reactive getters. If a spread coexists with other dynamic props, only the non-spread dynamic props are wrapped:

```tsx
// Input
<div {...props} class={cls()} />

// Output — spread unchanged, dynamic class wrapped
<div {...props} class={() => cls()} />
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
  return <div>{<span>Hello</span>}</div>;
}

// Output
const _$h0 = /*@__PURE__*/ <span>Hello</span>;
function App() {
  return <div>{_$h0}</div>;
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

JSX element trees with two or more DOM elements (no components, no spread attributes) are compiled to `_tpl()` calls instead of nested `h()` calls. The HTML string is parsed once via `<template>.innerHTML`, then `cloneNode(true)` for each instance:

```tsx
// Input
<div class="box">
  <span>{text()}</span>
</div>;

// Output
import { _tpl } from "@pyreon/runtime-dom";
import { _bind } from "@pyreon/reactivity";

_tpl('<div class="box"><span></span></div>', (__root) => {
  const __e0 = __root.children[0];
  const __t1 = document.createTextNode("");
  __e0.appendChild(__t1);
  const __d0 = _bind(() => {
    __t1.data = text();
  });
  return () => {
    __d0();
  };
});
```

### Eligibility Rules

A JSX tree is eligible for template emission when:

| Condition                                      | Eligible? | Reason                                         |
| ---------------------------------------------- | --------- | ---------------------------------------------- |
| 2+ DOM elements, all lowercase tags            | Yes       | Pure DOM tree                                  |
| Single element (`<div>text</div>`)             | No        | Not enough elements to benefit                 |
| Contains component (`<MyComp />`)              | No        | Components need runtime instantiation          |
| Has spread attributes (`&#123;...props&#125;`) | No        | Spread requires dynamic prop application       |
| Has `key` prop                                 | No        | Keyed elements need reconciliation metadata    |
| Contains fragment child (`<>...</>`)           | No        | Fragment breaks DOM structure assumptions      |
| Mixed element + expression children            | No        | `childNodes` indexing becomes unreliable       |
| Multiple expression children in same parent    | No        | Only single `textContent` per parent supported |
| Expression child containing nested JSX         | No        | Too complex for template codegen               |

### What Gets Baked Into HTML

Static parts of the template are baked directly into the HTML string, avoiding any runtime prop application:

```tsx
// Input
<div class="container">
  <input disabled />
  <span>Static text</span>
</div>

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

**Reactive attributes** use `_bind()` to create a render effect:

```tsx
// Input
<div class={cls()}>
  <span>{name()}</span>
</div>;

// Output bind function:
(__root) => {
  const __e0 = __root.children[0];
  const __d0 = _bind(() => {
    __root.className = cls();
  });
  const __t1 = document.createTextNode("");
  __e0.appendChild(__t1);
  const __d1 = _bind(() => {
    __t1.data = name();
  });
  return () => {
    __d0();
    __d1();
  };
};
```

**One-time static expressions** (no calls, so not reactive) are set directly without `_bind()`:

```tsx
// Input
<div>
  <span>{label}</span>
</div>;

// Output bind function:
(__root) => {
  const __e0 = __root.children[0];
  __e0.textContent = label;
  return null;
};
```

**Event handlers** are converted to `addEventListener` calls:

```tsx
// Input
<div>
  <button onClick={handler}>click</button>
</div>;

// Output bind function:
(__root) => {
  const __e0 = __root.children[0];
  __e0.addEventListener("click", handler);
  return null;
};
```

The event name is derived by lowering the third character: `onClick` becomes `"click"`, `onMouseEnter` becomes `"mouseEnter"`.

**Ref props** are converted to direct `.current` assignments:

```tsx
// Input
<div>
  <input ref={myRef} />
</div>;

// Output bind function:
(__root) => {
  const __e0 = __root.children[0];
  myRef.current = __e0;
  return null;
};
```

### Reactive Text Nodes

For dynamic text content, the compiler creates a persistent `TextNode` and updates its `.data` property rather than setting `.textContent` on the parent. This avoids destroying and recreating the text node on every reactive update:

```tsx
const __t0 = document.createTextNode("");
__e0.appendChild(__t0);
const __d0 = _bind(() => {
  __t0.data = name();
});
```

### Cleanup / Disposal

The bind function returns a cleanup function that disposes all reactive bindings. When no dynamic bindings exist, it returns `null`:

```tsx
// No dynamic parts → null cleanup
_tpl("<div><span>static</span></div>", () => null);

// Multiple dynamic parts → composed cleanup
_tpl("...", (__root) => {
  const __d0 = _bind(() => {
    __root.className = cls();
  });
  const __d1 = _bind(() => {
    __t0.data = name();
  });
  return () => {
    __d0();
    __d1();
  };
});
```

### Element Access Paths

The bind function accesses child elements using `children[]` indexing from the root:

```tsx
// Input
<div>
  <span>{a()}</span>
  <em>{b()}</em>
</div>

// Paths:
// __root              → <div>
// __root.children[0]  → <span>
// __root.children[1]  → <em>
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

// Paths chain: __root.children[0].children[0].children[0] → <td>
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

When template emission is used, the compiler automatically prepends import statements:

```ts
import { _tpl } from "@pyreon/runtime-dom";
import { _bind } from "@pyreon/reactivity";
```

These imports are only added when at least one `_tpl()` call is emitted. The `usesTemplates` flag on the transform result indicates whether this happened.

### Performance Benefits

Template emission provides significant performance improvements:

- **`cloneNode(true)` is 5-10x faster** than sequential `createElement` + `setAttribute` calls
- **Zero VNode, props-object, or children-array allocations** per instance
- **Static attributes are baked into the HTML string** -- no runtime prop application needed
- **Dynamic attributes and text use `_bind()`** for efficient reactive updates with automatic cleanup
- **Persistent `TextNode` reuse** avoids destroy/recreate overhead on text updates

### Real-World Template: Benchmark Row

Here is a realistic benchmark-style table row showing all template features working together:

```tsx
// Input
<tr class={cls()}>
  <td class="id">{String(row.id)}</td>
  <td>{row.label()}</td>
</tr>;

// Output
_tpl('<tr><td class="id"></td><td></td></tr>', (__root) => {
  const __e0 = __root.children[0];
  const __e1 = __root.children[1];
  const __d0 = _bind(() => {
    __root.className = cls();
  });
  const __t2 = document.createTextNode("");
  __e0.appendChild(__t2);
  const __d1 = _bind(() => {
    __t2.data = String(row.id);
  });
  const __t3 = document.createTextNode("");
  __e1.appendChild(__t3);
  const __d2 = _bind(() => {
    __t3.data = row.label();
  });
  return () => {
    __d0();
    __d1();
    __d2();
  };
});
```

Static class `"id"` is baked into the HTML. Dynamic class `cls()` and text children `String(row.id)` / `row.label()` use `_bind()`.

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
  message: string;
  line: number; // 1-based line number
  column: number; // 0-based column number
  code: "signal-call-in-jsx" | "missing-key-on-for" | "signal-in-static-prop";
}
```

## API Reference

### `transformJSX(code, filename?)`

The main API. Transforms JSX source code, applying reactive wrapping, static hoisting, and template emission.

```ts
import { transformJSX } from "@pyreon/compiler";

const result = transformJSX(code, "MyComponent.tsx");

console.log(result.code); // Transformed source code
console.log(result.usesTemplates); // true if _tpl() was emitted
console.log(result.warnings); // Array of compiler warnings
```

**Parameters:**

- **`code`** (`string`) -- The JSX source code to transform.
- **`filename`** (`string`, optional) -- The filename for parser context. Defaults to `"input.tsx"`. All files are parsed as TSX regardless of extension.

**Returns:** `TransformResult`

### `TransformResult`

```ts
interface TransformResult {
  /** Transformed source code (JSX preserved, only expression containers modified) */
  code: string;
  /** Whether the output uses _tpl/_bind template helpers (needs auto-import) */
  usesTemplates?: boolean;
  /** Compiler warnings for common mistakes */
  warnings: CompilerWarning[];
}
```

### `CompilerWarning`

```ts
interface CompilerWarning {
  /** Warning message */
  message: string;
  /** Source file line number (1-based) */
  line: number;
  /** Source file column number (0-based) */
  column: number;
  /** Warning code for filtering */
  code: "signal-call-in-jsx" | "missing-key-on-for" | "signal-in-static-prop";
}
```

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
| `<Comp :prop='expr()'>`                     | Unchanged                            | Component prop (not wrapped)         |
| `<div>&#123;<span>text</span>&#125;</div>`  | Hoisted to module scope              | Static JSX child                     |
| `<div><span>&#123;t()&#125;</span></div>`   | `_tpl(...)` call                     | Template-eligible tree (2+ elements) |
| `<div &#123;...props&#125;>`                | Unchanged                            | Spread left as-is                    |

## Integration with Vite Plugin

The compiler is used automatically by `@pyreon/vite-plugin`. For custom integrations, call `transformJSX` in your build tool's transform hook:

```ts
import { transformJSX } from "@pyreon/compiler";

function myBuildPlugin() {
  return {
    name: "my-pyreon-transform",
    transform(code: string, id: string) {
      if (id.endsWith(".tsx") || id.endsWith(".jsx") || id.endsWith(".pyreon")) {
        const result = transformJSX(code, id);

        // Log any warnings
        for (const warning of result.warnings) {
          console.warn(`[pyreon] ${id}:${warning.line}:${warning.column} ${warning.message}`);
        }

        return { code: result.code, map: null };
      }
    },
  };
}
```

### Webpack Loader Example

```ts
import { transformJSX } from "@pyreon/compiler";

export default function pyreonLoader(source: string) {
  const result = transformJSX(source, this.resourcePath);

  for (const warning of result.warnings) {
    this.emitWarning(new Error(warning.message));
  }

  return result.code;
}
```

### Rollup Plugin Example

```ts
import { transformJSX } from "@pyreon/compiler";

export default function pyreonPlugin() {
  return {
    name: "pyreon-compiler",
    transform(code: string, id: string) {
      if (!/\.[jt]sx$/.test(id)) return null;

      const result = transformJSX(code, id);

      if (result.warnings.length > 0) {
        for (const w of result.warnings) {
          this.warn({ message: w.message, id, pos: { line: w.line, column: w.column } });
        }
      }

      return { code: result.code, map: null };
    },
  };
}
```

## Known Limitations

### Nested JSX in Expression Containers

Expressions inside nested JSX within a child expression container are not individually wrapped. They are still reactive because the outer wrapper re-evaluates the whole subtree, just at a coarser granularity:

```tsx
// The inner name() is NOT individually wrapped — but the outer () =>
// re-evaluates the entire subtree when show() changes.
<div>{() => show() && <span>{name()}</span>}</div>
```

Fine-grained nested wrapping is planned for a future pass.

### Fragment Children in Templates

Templates bail out when encountering fragment children, since fragments break the assumed DOM structure:

```tsx
// This will NOT use template emission:
<div><>text</></div>

// This will use template emission:
<div><span>text</span></div>
```

### Mixed Element and Expression Children

A parent element with both element children and expression children is not eligible for template emission, because `childNodes` indexing becomes unreliable:

```tsx
// NOT template-eligible (mixed element + expression children):
<div><span />{text()}</div>

// Template-eligible (expression-only children per parent):
<div><span>{text()}</span></div>
```

## Implementation Details

The compiler is built on the TypeScript parser (`ts.createSourceFile`) for accurate JSX position tracking. It collects string-level replacements using character offsets, then applies them in a single left-to-right pass via a string builder (`parts.push()` + `join()`). This O(n) approach avoids the overhead of full AST-to-code generation and keeps the output close to the original source.

The implementation is a single recursive `walk()` function that visits every node in the source file. Template emission is checked first to avoid double-processing elements that get compiled to `_tpl()` calls. When a template-eligible subtree is found, the entire subtree is replaced with a single `_tpl()` call and the walker does not recurse into it.

## Exports Summary

| Export            | Type     | Description                                               |
| ----------------- | -------- | --------------------------------------------------------- |
| `transformJSX`    | Function | Transform JSX source code with Pyreon's reactive compiler |
| `TransformResult` | Type     | Interface for the transform output                        |
| `CompilerWarning` | Type     | Interface for compiler warning objects                    |
