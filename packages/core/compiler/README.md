# @pyreon/compiler

JSX reactive transform for Pyreon. Automatically wraps dynamic expressions in reactive getters and hoists static JSX nodes to module scope.

## Install

```bash
bun add @pyreon/compiler
```

## Quick Start

```ts
import { transformJSX } from '@pyreon/compiler'

const result = transformJSX(
  `
  const App = () => <div class={color()}>{count()}</div>
`,
  'app.tsx',
)

console.log(result.code)
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

- **`transformJSX(code, filename?, options?): TransformResult`** -- Transforms JSX source code. Uses the Rust native binary when available, falls back to JS.
- **`transformJSX_JS(code, filename?, options?): TransformResult`** -- JS-only transform (bypasses native binary). Useful for debugging or cross-backend testing.

### Types

- **`TransformResult`** -- `{ code: string; usesTemplates?: boolean; warnings: CompilerWarning[] }`
- **`TransformOptions`** -- `{ ssr?: boolean }` -- Set `ssr: true` to skip `_tpl()` template emission for server-side rendering.

## Architecture

**Dual-backend**: Rust native binary (napi-rs, 3.7-8.9x faster) with automatic JS fallback.

- **Rust path** (`native/`): full reactive pass using `oxc_parser`/`oxc_ast` Rust crates directly. Zero JSON serialization, zero JS AST traversal. Single-pass recursive walk with cached analysis.
- **JS fallback** (`src/jsx.ts`): uses `oxc-parser` (Rust NAPI binding) for parsing + JS reactive pass. Activated automatically when the native binary isn't available.
- **Auto-detection**: `transformJSX()` loads the native binary via `createRequire` (ESM-safe), falls back per-call with try/catch.

## Implementation Notes

- Props named `key` and `ref` are never wrapped.
- Props matching `on[A-Z]*` (event handlers) are never wrapped.
- Prop-derived variable resolution is fully AST-based — walks `IdentifierReference` nodes, never scans source text.
- 527 tests: 347 original + 180 cross-backend equivalence tests (Unicode, TypeScript syntax, control flow, string collision resistance).

## License

MIT
