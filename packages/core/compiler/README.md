# @pyreon/compiler

JSX reactive transform for Pyreon. Automatically wraps dynamic expressions in reactive getters and hoists static JSX nodes to module scope.

## Install

```bash
bun add @pyreon/compiler
```

## Quick Start

```ts
import { transformJSX } from "@pyreon/compiler";

const result = transformJSX(
  `
  const App = () => <div class={color()}>{count()}</div>
`,
  "app.tsx",
);

console.log(result.code);
// Dynamic expressions are wrapped: {() => count()}, class={() => color()}
// Static JSX nodes are hoisted to module scope
```

## What It Does

The compiler transforms JSX expression containers and props so the Pyreon runtime receives reactive getters instead of eagerly-evaluated values.

| Input                     | Output                     | Reason          |
| ------------------------- | -------------------------- | --------------- |
| `<div>{expr}</div>`       | `<div>{() => expr}</div>`  | Dynamic child   |
| `<div class={expr}>`      | `<div class={() => expr}>` | Dynamic prop    |
| `<button onClick={fn}>`   | unchanged                  | Event handler   |
| `<div>{() => expr}</div>` | unchanged                  | Already wrapped |
| `<div>{"literal"}</div>`  | unchanged                  | Static value    |

### Static Hoisting

Fully static JSX subtrees inside expression containers are hoisted to module-level constants, so they are created once at module initialization rather than per-render.

```ts
// Before
const App = () => <div>{<span>Hello</span>}</div>

// After
const _$h0 = <span>Hello</span>
const App = () => <div>{_$h0}</div>
```

## API

- **`transformJSX(code: string, filename?: string): TransformResult`** -- Transforms JSX source code. Returns an object with the transformed `code` string.

### Types

- **`TransformResult`** -- `{ code: string }` -- The output of a transform pass.

## Implementation Notes

- Uses the TypeScript parser for AST positions and magic-string for source replacements.
- Props named `key` and `ref` are never wrapped.
- Props matching `on[A-Z]*` (event handlers) are never wrapped.
- No extra runtime dependencies beyond TypeScript (already a dev dependency).

## License

MIT
