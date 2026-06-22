---
title: "JSX Reactive Transform — API Reference"
description: "JSX reactive transform (Rust native + JS fallback) plus the Reactivity-Lens sidecar, React→Pyreon migration, and project audits"
---

# @pyreon/compiler — API Reference

> **Generated** from `compiler`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [compiler](/docs/compiler).

Pyreon's JSX-to-reactive transform. `transformJSX` dispatches to a Rust native binary (napi-rs, 3.7-8.9× faster) and falls back per-call to the pure-JS `transformJSX_JS` when the binary is unavailable (CI, WASM, wrong platform); the two backends are asserted byte-identical by 180+ cross-backend equivalence tests. Emits `_tpl()` (cloneNode templates) + per-text-node `_bind()`, hoists static JSX, inlines `const`-from-`props`, and auto-calls bare signal references in JSX. Also ships the experimental Reactivity-Lens sidecar (`analyzeReactivity` — surfaces the compiler's own per-expression reactive/static decision back to editors), React-pattern detection + one-shot migration, the Pyreon anti-pattern detector behind the MCP `validate` tool, and the syntactic project audits powering `pyreon doctor` (test-environment / islands / SSG).

## Features

- Dual-backend transformJSX — Rust native (napi-rs) with automatic per-call JS fallback, byte-identical output
- Reactivity-Lens: analyzeReactivity / formatReactivityLens surface the compiler’s reactive-vs-static decision (experimental)
- Scope-aware signal auto-call: bare &#123;count&#125; → &#123;() =&gt; count()&#125;, shadowing-correct, knownSignals seeds cross-module
- detectReactPatterns + migrateReactCode — "coming from React" diagnostics + one-shot codemod
- detectPyreonPatterns — 14 "using Pyreon wrong" anti-pattern codes (the MCP validate detector)
- Project audits: auditTestEnvironment / auditIslands / auditSsg (power pyreon doctor)
- transformDeferInline — &lt;Defer&gt; namespace-import inlining pass
- generateContext — project scanner producing the AI .pyreon/context.json

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`transformJSX`](#transformjsx) | function | The production entry point. |
| [`transformJSX_JS`](#transformjsx-js) | function | The pure-JS reactive pass (parses via `oxc-parser`). |
| [`analyzeReactivity`](#analyzereactivity) | function | Reactivity-Lens entry point (experimental). |
| [`formatReactivityLens`](#formatreactivitylens) | function | Renders an `analyzeReactivity` result as an annotated-source CLI / debug view — each spanned expression gets an inline ` |
| [`detectReactPatterns`](#detectreactpatterns) | function | AST-based detector for "coming from React" mistakes — `useState` / `useEffect`, `className` / `htmlFor`, `onChange` on i |
| [`migrateReactCode`](#migratereactcode) | function | One-shot React→Pyreon codemod — `useState`→`signal`, `useEffect`→`effect`/`onMount`, `className`→`class`, etc. |
| [`hasReactPatterns`](#hasreactpatterns) | function | Fast regex pre-filter — returns whether `code` is worth a full `detectReactPatterns` AST walk. |
| [`diagnoseError`](#diagnoseerror) | function | Maps a raw runtime/build error string to a structured `ErrorDiagnosis` (likely cause + actionable fix) for known Pyreon  |
| [`detectPyreonPatterns`](#detectpyreonpatterns) | function | AST-based (TypeScript compiler API) detector for "using Pyreon wrong" mistakes — 14 codes today (`for-missing-by`, `for- |
| [`hasPyreonPatterns`](#haspyreonpatterns) | function | Fast regex pre-filter for `detectPyreonPatterns` — deliberately loose (the AST walker is the precise gate); only has to  |
| [`auditTestEnvironment`](#audittestenvironment) | function | Scans every `*.test.ts(x)` under `startDir` for the mock-vnode anti-pattern (constructing `{ type, props, children }` li |
| [`formatTestAudit`](#formattestaudit) | function | Human-readable renderer for an `auditTestEnvironment` result; `options.minRisk` filters the floor (`high` \| `medium` \| ` |
| [`auditIslands`](#auditislands) | function | Project-wide syntactic island audit — five cross-file detectors (`duplicate-name`, `never-with-registry-entry`, `registr |
| [`formatIslandAudit`](#formatislandaudit) | function | Text renderer for an `auditIslands` result — each finding with file path + line/column + an actionable fix suggestion. |
| [`auditSsg`](#auditssg) | function | Project-wide syntactic SSG audit — three detectors: `404-outside-layout-dir` (`_404.tsx` not co-located with `_layout.ts |
| [`formatSsgAudit`](#formatssgaudit) | function | Text renderer for an `auditSsg` result — file path + line/column + actionable fix per finding. |
| [`transformDeferInline`](#transformdeferinline) | function | Standalone pre-pass that inlines `<Defer>` namespace-import boundaries. |
| [`generateContext`](#generatecontext) | function | Project scanner — walks the source tree and produces a structured `ProjectContext` (routes, islands, components) that `@ |

## API

### transformJSX `function`

```ts
transformJSX(code: string, filename?: string, options?: TransformOptions): TransformResult
```

The production entry point. Tries the Rust native binary first (3.7-8.9× faster) and falls back per-call to `transformJSX_JS` inside a try/catch so a native panic never crashes the Vite dev server. Output (`{ code, usesTemplates?, warnings, reactivityLens? }`) is byte-identical across both backends. `options.ssr` skips the `_tpl()` template optimization so `@pyreon/runtime-server` can walk the VNode tree; `options.knownSignals` seeds cross-module signal auto-call; `options.reactivityLens` collects the additive `ReactivitySpan[]` sidecar (codegen is byte-identical whether or not it is collected).

**Example**

```tsx
import { transformJSX } from "@pyreon/compiler"

const { code, warnings } = transformJSX(
  "export const App = () => <div>{count()}</div>",
  "App.tsx",
  { knownSignals: ["count"] },
)
```

**Common mistakes**

- Expecting `transformJSX` to throw on a native panic — it never does; it silently falls back to the JS backend (correctness-equivalent, just slower)
- Passing user component source WITHOUT `ssr: true` when feeding the result to `@pyreon/runtime-server` — SSR needs the `h()` VNode tree, not `_tpl()` clone templates
- Assuming bare `{count}` is auto-called for an IMPORTED signal without seeding `knownSignals` — the compiler only tracks `const count = signal(...)` declared in the same file unless told otherwise

**See also:** `transformJSX_JS` · `analyzeReactivity`

---

### transformJSX_JS `function`

```ts
transformJSX_JS(code: string, filename?: string, options?: TransformOptions): TransformResult
```

The pure-JS reactive pass (parses via `oxc-parser`). Same signature and byte-identical output to the native path — `transformJSX` calls it as the fallback. Call it directly only when you need backend-deterministic output (the Reactivity-Lens forces this path so the sidecar is always emitted regardless of whether the native binary is installed).

**Example**

```tsx
import { transformJSX_JS } from "@pyreon/compiler"

// Backend-deterministic — never dispatches to the native binary.
const { code } = transformJSX_JS("<div>{name()}</div>", "x.tsx")
```

**See also:** `transformJSX`

---

### analyzeReactivity `function` — **experimental**

```ts
analyzeReactivity(code: string, filename?: string, options?: { knownSignals?: string[] }): AnalyzeReactivityResult
```

Reactivity-Lens entry point (experimental). The compiler ALREADY decides per-expression whether code is reactive while emitting codegen; this surfaces that ground truth back to the author instead of discarding it. Returns `{ findings, spans }` — `findings` merges the structural codegen decisions (`reactive` / `reactive-prop` / `reactive-attr` / `static-text` / `hoisted-static`) with the EXISTING `detectPyreonPatterns` footguns (`kind: 'footgun'`, carrying the detector `code`) under one (line, column)-sorted taxonomy. Forces the JS backend so the sidecar is always present. Absence of a span is “not asserted”, never an implicit static claim.

**Example**

```tsx
import { analyzeReactivity, formatReactivityLens } from "@pyreon/compiler"

const result = analyzeReactivity(
  "const A = (props) => <div>{props.name}</div>",
  "A.tsx",
)
for (const f of result.findings) console.log(f.line, f.kind, f.detail)
console.log(formatReactivityLens(code, result)) // annotated-source debug view
```

**Common mistakes**

- Treating the absence of a span as a static guarantee — the Lens is asymmetric: positive spans are RECORDS of a codegen branch; silence means "not analyzed", not "proven static"
- Expecting it to reflect the native backend — it deliberately forces `transformJSX_JS`; codegen is byte-identical so the analysis is sound, native just does not emit the sidecar at production bundle time (it is an editor-only feature)
- Calling it on a hot build path — it is an authoring-time / LSP tool, not part of the production transform pipeline

**See also:** `formatReactivityLens` · `detectPyreonPatterns` · `transformJSX_JS`

---

### formatReactivityLens `function` — **experimental**

```ts
formatReactivityLens(code: string, result: AnalyzeReactivityResult): string
```

Renders an `analyzeReactivity` result as an annotated-source CLI / debug view — each spanned expression gets an inline `live` / `static` / `live·prop` / `hoisted` / footgun tag. The LSP surface in `@pyreon/lint --lsp` consumes the structured `findings` directly (inlay hints + diagnostics); this string renderer is for terminals and bug reports.

**Example**

```tsx
import { analyzeReactivity, formatReactivityLens } from "@pyreon/compiler"

const r = analyzeReactivity(src, "App.tsx")
process.stdout.write(formatReactivityLens(src, r))
```

**See also:** `analyzeReactivity`

---

### detectReactPatterns `function`

```ts
detectReactPatterns(code: string, filename?: string): ReactDiagnostic[]
```

AST-based detector for "coming from React" mistakes — `useState` / `useEffect`, `className` / `htmlFor`, `onChange` on inputs, `.value` writes on signals, React-package imports. Pairs with `detectPyreonPatterns` inside the MCP `validate` tool; the merged result is sorted by line + column.

**Example**

```tsx
import { detectReactPatterns } from "@pyreon/compiler"

const diags = detectReactPatterns("const [n,setN] = useState(0)", "x.tsx")
console.log(diags[0]?.code) // "react-use-state"
```

**See also:** `migrateReactCode` · `detectPyreonPatterns` · `hasReactPatterns`

---

### migrateReactCode `function`

```ts
migrateReactCode(code: string, filename?: string): MigrationResult
```

One-shot React→Pyreon codemod — `useState`→`signal`, `useEffect`→`effect`/`onMount`, `className`→`class`, etc. Returns the rewritten code plus the list of applied `MigrationChange`s. Mechanical only: shapes it cannot safely rewrite are left as `detectReactPatterns` diagnostics for the human.

**Example**

```tsx
import { migrateReactCode } from "@pyreon/compiler"

const { code, changes } = migrateReactCode(reactSource, "C.tsx")
```

**See also:** `detectReactPatterns`

---

### hasReactPatterns `function`

```ts
hasReactPatterns(code: string): boolean
```

Fast regex pre-filter — returns whether `code` is worth a full `detectReactPatterns` AST walk. Cheap gate for batch scanners; never reports diagnostics itself.

**Example**

```tsx
import { hasReactPatterns, detectReactPatterns } from "@pyreon/compiler"

if (hasReactPatterns(src)) report(detectReactPatterns(src, file))
```

**See also:** `detectReactPatterns`

---

### diagnoseError `function`

```ts
diagnoseError(error: string): ErrorDiagnosis | null
```

Maps a raw runtime/build error string to a structured `ErrorDiagnosis` (likely cause + actionable fix) for known Pyreon failure shapes. Returns `null` when the error is unrecognised — callers fall back to the raw message.

**Example**

```tsx
import { diagnoseError } from "@pyreon/compiler"

const d = diagnoseError("props.when is not a function")
if (d) console.log(d.cause, d.fix)
```

---

### detectPyreonPatterns `function`

```ts
detectPyreonPatterns(code: string, filename?: string): PyreonDiagnostic[]
```

AST-based (TypeScript compiler API) detector for "using Pyreon wrong" mistakes — 14 codes today (`for-missing-by`, `for-with-key`, `props-destructured`, `props-destructured-body`, `process-dev-gate`, `empty-theme`, `raw-add-event-listener`, `raw-remove-event-listener`, `date-math-random-id`, `on-click-undefined`, `signal-write-as-call`, `static-return-null-conditional`, `as-unknown-as-vnodechild`, `island-never-with-registry-entry`). The detector arm behind the MCP `validate` tool and `pyreon doctor --check-pyreon-patterns`. Every diagnostic reports `fixable: false` (invariant — no `migrate_pyreon` codemod ships yet).

**Example**

```tsx
import { detectPyreonPatterns } from "@pyreon/compiler"

const diags = detectPyreonPatterns(
  "const A = (props) => { const { x } = props; return <i>{x}</i> }",
  "A.tsx",
)
console.log(diags[0]?.code) // "props-destructured-body"
```

**Common mistakes**

- Reading `fixable` as sometimes-true — it is an enforced `false` invariant for every Pyreon code; wiring auto-fix UX off it applies nothing
- Expecting it to flag `const { x } = props.nested` or an `onMount`-scoped destructure — `props-destructured-body` is deliberately scoped to the canonical `= props` body-scope shape for zero false positives

**See also:** `hasPyreonPatterns` · `detectReactPatterns` · `analyzeReactivity`

---

### hasPyreonPatterns `function`

```ts
hasPyreonPatterns(code: string): boolean
```

Fast regex pre-filter for `detectPyreonPatterns` — deliberately loose (the AST walker is the precise gate); only has to avoid skipping a file that might contain a pattern.

**Example**

```tsx
import { hasPyreonPatterns, detectPyreonPatterns } from "@pyreon/compiler"

if (hasPyreonPatterns(src)) report(detectPyreonPatterns(src, file))
```

**See also:** `detectPyreonPatterns`

---

### auditTestEnvironment `function`

```ts
auditTestEnvironment(startDir: string): TestAuditResult
```

Scans every `*.test.ts(x)` under `startDir` for the mock-vnode anti-pattern (constructing `{ type, props, children }` literals or a `vnode()` helper instead of going through real `h()`), the bug class behind PR #197’s silent metadata drop. Classifies each file HIGH / MEDIUM / LOW. Powers the MCP `audit_test_environment` tool and `pyreon doctor --audit-tests`.

**Example**

```tsx
import { auditTestEnvironment, formatTestAudit } from "@pyreon/compiler"

const r = auditTestEnvironment(process.cwd())
console.log(formatTestAudit(r, { minRisk: "high" }))
```

**See also:** `formatTestAudit` · `auditIslands` · `auditSsg`

---

### formatTestAudit `function`

```ts
formatTestAudit(result: TestAuditResult, options?: AuditFormatOptions): string
```

Human-readable renderer for an `auditTestEnvironment` result; `options.minRisk` filters the floor (`high` | `medium` | `low`). The CLI / MCP surfaces also have a JSON path — this is the text view.

**Example**

```tsx
import { auditTestEnvironment, formatTestAudit } from "@pyreon/compiler"

console.log(formatTestAudit(auditTestEnvironment("."), { minRisk: "medium" }))
```

**See also:** `auditTestEnvironment`

---

### auditIslands `function`

```ts
auditIslands(rootDir: string): IslandAuditResult
```

Project-wide syntactic island audit — five cross-file detectors (`duplicate-name`, `never-with-registry-entry`, `registry-mismatch`, `nested-island`, `dead-island`) that auto-registry and the per-file detector cannot reach. No type-check pass / module resolution; entirely TypeScript-compiler-API syntactic. Powers `pyreon doctor --check-islands` + the MCP `audit_islands` tool.

**Example**

```tsx
import { auditIslands, formatIslandAudit } from "@pyreon/compiler"

const r = auditIslands(process.cwd())
for (const f of r.findings) console.log(f.code, f.location.file)
```

**See also:** `formatIslandAudit` · `auditTestEnvironment` · `auditSsg`

---

### formatIslandAudit `function`

```ts
formatIslandAudit(result: IslandAuditResult, options?: IslandAuditFormatOptions): string
```

Text renderer for an `auditIslands` result — each finding with file path + line/column + an actionable fix suggestion. The `--json` CLI path bypasses this for CI gates.

**Example**

```tsx
import { auditIslands, formatIslandAudit } from "@pyreon/compiler"

console.log(formatIslandAudit(auditIslands(".")))
```

**See also:** `auditIslands`

---

### auditSsg `function`

```ts
auditSsg(rootDir: string): SsgAuditResult
```

Project-wide syntactic SSG audit — three detectors: `404-outside-layout-dir` (`_404.tsx` not co-located with `_layout.tsx` → no layout chrome), `dynamic-route-missing-get-static-paths` (`[id].tsx` without `getStaticPaths` → silently skipped by SSG auto-detect), `non-literal-revalidate-export` (`export const revalidate = TTL` → dropped from the build-time ISR manifest). API routes (`src/routes/api/` or no `export default`) are skipped. Powers `pyreon doctor --check-ssg`.

**Example**

```tsx
import { auditSsg, formatSsgAudit } from "@pyreon/compiler"

const r = auditSsg(process.cwd())
for (const f of r.findings) console.log(f.code, f.location.file)
```

**See also:** `formatSsgAudit` · `auditIslands`

---

### formatSsgAudit `function`

```ts
formatSsgAudit(result: SsgAuditResult, options?: SsgAuditFormatOptions): string
```

Text renderer for an `auditSsg` result — file path + line/column + actionable fix per finding. CI gates use the JSON path instead.

**Example**

```tsx
import { auditSsg, formatSsgAudit } from "@pyreon/compiler"

console.log(formatSsgAudit(auditSsg(".")))
```

**See also:** `auditSsg`

---

### transformDeferInline `function`

```ts
transformDeferInline(code: string, filename?: string): DeferInlineResult
```

Standalone pre-pass that inlines `<Defer>` namespace-import boundaries. Fast-paths out entirely when the source contains no `Defer` mention (no parse). Returns `{ code, changed, warnings }`; runs before the JSX transform in the Vite plugin chain.

**Example**

```tsx
import { transformDeferInline } from "@pyreon/compiler"

const { code, changed } = transformDeferInline(src, "page.tsx")
```

---

### generateContext `function`

```ts
generateContext(cwd: string): ProjectContext
```

Project scanner — walks the source tree and produces a structured `ProjectContext` (routes, islands, components) that `@pyreon/vite-plugin` regenerates into `.pyreon/context.json` for AI agents. Syntactic only; no type-check / bundle.

**Example**

```tsx
import { generateContext } from "@pyreon/compiler"

const ctx = generateContext(process.cwd())
console.log(ctx.routes.length, ctx.islands.length)
```

---

## Package-level notes

> **Dual backend:** Reverting `src/jsx.ts` (the JS path) is INVISIBLE to anything that goes through the native binary — the Rust path in `native/src/lib.rs` is a parallel implementation, kept byte-identical by the cross-backend equivalence tests. Edits to transform behavior must land in BOTH; the equivalence suite is the gate.

> **Reactivity-Lens is editor-only:** `analyzeReactivity` / `formatReactivityLens` are authoring-time tools (LSP inlay hints via `@pyreon/lint --lsp`, CLI debug). They are NOT consumed at production bundle time and force the JS backend — they never affect emitted code (`reactivityLens` is an additive, byte-neutral sidecar).

> **Detectors are not codemods:** `detectPyreonPatterns` always reports `fixable: false` (enforced invariant). `detectReactPatterns` is paired with the real `migrateReactCode` codemod; the Pyreon detector has no companion codemod yet, so consumers must not wire auto-fix UX off its `fixable` flag.
