# @pyreon/compiler

JSX reactive transform (Rust native + JS fallback) plus authoring-time analysis tools.

`@pyreon/compiler` is the build-time toolchain Pyreon ships. It transforms JSX into `_tpl()` + `_bind()` cloneNode templates against `@pyreon/runtime-dom`, auto-wraps dynamic expressions in reactive getters, hoists fully-static subtrees to module scope, inlines `const`-from-`props` for end-to-end reactivity, and auto-calls bare signal references in JSX. The reactive transform ships as a Rust native binary (napi-rs, 3.7-8.9× faster) with a per-call JS fallback — cross-backend equivalence is asserted by 180+ tests. The package also exports authoring-time tools: a Reactivity-Lens sidecar, React-pattern detection + one-shot migration, a Pyreon anti-pattern detector (the MCP `validate` engine), and three project audits (`auditTestEnvironment`, `auditIslands`, `auditSsg`) consumed by `pyreon doctor`.

Most users never call this package directly — `@pyreon/vite-plugin` wires it into Vite for you.

## Install

```bash
bun add -D @pyreon/compiler
```

## What it does

The compiler transforms JSX expression containers and props so the runtime receives reactive getters instead of eagerly-evaluated values.

| Input                     | Output                       | Reason            |
| ------------------------- | ---------------------------- | ----------------- |
| `<div>{expr}</div>`       | `<div>{() => expr}</div>`    | Dynamic child     |
| `<div class={expr}>`      | `<div class={expr}>`   | Dynamic prop      |
| `<div>{count}</div>` *    | `<div>{count()}</div>` | Signal auto-call  |
| `<button onClick={fn}>`   | unchanged                    | Event handler     |
| `<div>{() => expr}</div>` | unchanged                    | Already wrapped   |
| `<div>{"literal"}</div>`  | unchanged                    | Static value      |
| `<Comp {...src}>`         | `<Comp {..._wrapSpread(src)}>` | Reactive-safe spread |

\* When `count` is declared as `const count = signal(...)` in the same module, or passed via the `knownSignals` option (the `@pyreon/vite-plugin` does this for cross-module signal exports automatically).

### Static hoisting

Fully static JSX subtrees are hoisted to module-level constants, so they're created once at module initialization:

```tsx
// Before
const App = () => <div>{<span>Hello</span>}</div>

// After
const _$h0 = <span>Hello</span>
const App = () => <div>{_$h0}</div>
```

### Template-based mount

Element trees with ≥1 DOM tag emit `_tpl()` + `_bind()` instead of nested `h()` calls — cloneNode for the static skeleton, per-text-node `_bind()` for surgical updates. Zero VNode allocations on the static parts.

### Auto-promoted fast paths

Three canonical reactive shapes auto-promote to effect-free runtime calls (~5 → ~2 allocations per binding, no `renderEffect` setup):

| Source                                                          | Default emit                                  | Auto-promoted to                                              |
| --------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| `<tr class={sel(k) ? 'a' : 'b'}>` ¹                       | `_bind(() => el.className = sel(k) ? 'a' : 'b')` | `sel.subscribe(k, m => el.className = m ? 'a' : 'b')` |
| `<td>{sel(k) ? 'X' : ''}</td>` ¹                          | `_bind(() => t.data = sel(k) ? 'X' : '')`     | `sel.subscribe(k, m => t.data = m ? 'X' : '')`                |
| `<span>{count().toFixed(2)}</span>` ²                           | `_bind(() => t.data = count().toFixed(2))`    | `_bindDirect(count, v => t.data = v.toFixed(2))`              |

¹ `sel` must be declared as `const sel = createSelector(...)` at module scope; key and branches must be non-reactive. ² Method must be in the pure-primitive safelist (Number / String / Boolean prototype: `toFixed`, `toUpperCase`, `slice`, `padStart`, etc. — 28 methods); args must be non-reactive.

Conservative bail catalog — uncertain shapes fall back to `_bind(...)` unchanged. See [docs/src/content/docs/compiler.md](../../../docs/src/content/docs/compiler.md) for the full detection logic.

## Reactive transform — Quick start

```ts
import { transformJSX } from '@pyreon/compiler'

const { code, warnings, usesTemplates } = transformJSX(
  `const App = () => <div class={color()}>{count()}</div>`,
  'App.tsx',
  {
    ssr: false,                           // Skip template emission for SSR
    knownSignals: ['count', 'color'],     // Cross-module signal names → auto-call
    reactivityLens: false,                // Opt-in sidecar
    collapseRocketstyle: false,           // Advanced — see "Rocketstyle collapse" below
  },
)
```

`transformJSX_JS(...)` is the forced JS-backend variant — deterministic, used by `analyzeReactivity` and useful for debugging the native path.

## Authoring-time tools (editor-side)

```ts
import { analyzeReactivity, formatReactivityLens } from '@pyreon/compiler'

// Surface the compiler's reactive/static decisions back to the editor
const { findings, spans } = analyzeReactivity(
  `const A = (props) => <div>{props.name}</div>`,
  'A.tsx',
)
// findings: ReactivityFinding[] — merged footgun + structural taxonomy
// spans: ReactivitySpan[] — { kind: 'reactive' | 'static-text' | 'hoisted-static' | ... }

console.log(formatReactivityLens(source, { findings, spans }))
```

The Lens is **additive** — `TransformResult.code` is byte-identical with or without `reactivityLens: true`. Spans are RECORDS of a codegen branch; absence is "not asserted", never an implicit static claim.

## React migration

```ts
import { detectReactPatterns, migrateReactCode, diagnoseError } from '@pyreon/compiler'

const diagnostics = detectReactPatterns(reactSource, 'App.tsx')
// diagnostics: ReactDiagnostic[] with codes like 'use-state', 'use-effect', 'class-name'

const { code, changes } = migrateReactCode(reactSource, 'App.tsx')
// One-shot codemod: useState → signal, useEffect → effect, className → class, etc.

const err = new Error('useState is not defined')
diagnoseError(err, source) // ErrorDiagnosis — points users at the migration step
```

The migration is a one-shot codemod, **not** a runtime adapter. For runtime compat layers, see `@pyreon/react-compat`.

## Pyreon anti-pattern detector

```ts
import { detectPyreonPatterns, hasPyreonPatterns } from '@pyreon/compiler'

const diags = detectPyreonPatterns(
  `const C = ({ state }) => <div>{state}</div>`,
  'C.tsx',
)
// PyreonDiagnostic[] — 16 codes today: 'for-missing-by', 'for-with-key',
// 'props-destructured', 'props-destructured-body', 'process-dev-gate',
// 'empty-theme', 'raw-add-event-listener', 'raw-remove-event-listener',
// 'date-math-random-id', 'on-click-undefined', 'signal-write-as-call',
// 'static-return-null-conditional', 'static-early-return-conditional',
// 'as-unknown-as-vnodechild', 'island-never-with-registry-entry',
// 'query-options-as-function'
```

This is what the MCP `validate({ code })` tool runs. Some shapes are caught syntactically here AND also as lint rules in `@pyreon/lint` (proactive + reactive — the agent sees the fix before commit; CI catches it post-commit).

## Project audits

```ts
import { auditIslands, auditSsg, auditTestEnvironment } from '@pyreon/compiler'

const islandResult = auditIslands(projectRoot)
const ssgResult = auditSsg(projectRoot)
const testResult = auditTestEnvironment(projectRoot, { minRisk: 'high' })
```

Three syntactic project-wide audits consumed by `pyreon doctor --check-islands` / `--check-ssg` / `--audit-tests`. Pure-AST, no type-check pass — designed for CI speed.

## Compiler-emitted runtime helpers

The transform emits calls to symbols exported by `@pyreon/runtime-dom` and `@pyreon/core`:

| Helper           | Where exported          | Purpose |
|------------------|-------------------------|---------|
| `_tpl(html)`     | `@pyreon/runtime-dom`   | Parse + clone an HTML template once per template literal |
| `_bind(fn, …)`   | `@pyreon/runtime-dom`   | Per-binding reactive update wired to a template node |
| `_bindText(…)`   | `@pyreon/runtime-dom`   | Fast path for reactive text nodes |
| `_bindDirect(…)` | `@pyreon/runtime-dom`   | Fast path for reactive attributes |
| `_setChild(node, value)` | `@pyreon/runtime-dom` | Static sole `{x}` child — mounts a VNode/VNode[] value, else sets `textContent` (a bare `{arr}` renders the elements, not `[object Object]`) |
| `_setChildAt(parent, placeholder, value)` | `@pyreon/runtime-dom` | Static mixed `{x}` child — mounts a VNode/VNode[] value at a `<!>` placeholder, else inserts a text node |
| `_applyProps(…)` | `@pyreon/runtime-dom`   | Spread props on a template element |
| `_rp(thunk)`     | `@pyreon/core`          | Brand a reactive prop wrapper |
| `_wrapSpread(s)` | `@pyreon/core`          | Preserve reactivity through `<Comp {...source}>` |

## Architecture — dual backend

**Rust native binary** (`native/`): full reactive pass via `oxc_parser`/`oxc_ast`. Zero JSON serialization, single-pass recursive walk with `FxHashMap`-cached `isDynamic` analysis. ~2,800 lines of Rust, compiled to a ~1MB `.node` binary.

**JS fallback** (`src/jsx.ts`): uses `oxc-parser` (Rust NAPI binding) for parsing + a JS reactive pass. Activated automatically when the native binary isn't available (CI without the per-platform package, WASM, unsupported platform). The fallback path is silent — no error, just a slower transform.

**Per-platform packages**: the native binary ships as separate optional dependencies, one per platform. npm / bun install only the matching one via `os` / `cpu` fields:

| Platform | Arch | libc | Package                              |
|----------|------|------|--------------------------------------|
| darwin   | arm64 | —    | `@pyreon/compiler-darwin-arm64`      |
| darwin   | x64   | —    | `@pyreon/compiler-darwin-x64`        |
| linux    | x64   | gnu  | `@pyreon/compiler-linux-x64-gnu`     |
| linux    | x64   | musl | `@pyreon/compiler-linux-x64-musl`    |
| linux    | arm64 | gnu  | `@pyreon/compiler-linux-arm64-gnu`   |
| linux    | arm64 | musl | `@pyreon/compiler-linux-arm64-musl`  |
| win32    | x64   | —    | `@pyreon/compiler-win32-x64-msvc`    |

A `detectLibc()` step distinguishes glibc vs musl on Linux at load time.

## Implementation notes

- Props named `key` and `ref` are never wrapped.
- Props matching `on[A-Z]*` (event handlers) are never wrapped.
- Prop-derived variable resolution is fully AST-based — walks `IdentifierReference` nodes, never scans source text. Cycle detection via a `resolving` set prevents infinite recursion.
- 527+ tests: 347 original + 180 cross-backend equivalence (Unicode, TypeScript syntax, control flow, string collision resistance).
- `analyzeReactivity` always uses the JS backend — it's the deterministic oracle for the merged footgun + structural taxonomy.

## Documentation

Full docs: [pyreon.dev/docs/compiler](https://pyreon.dev/docs/compiler) (or `docs/src/content/docs/compiler.md` in this repo).

## License

MIT
