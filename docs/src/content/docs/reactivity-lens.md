---
title: 'Reactivity Lens'
description: See which expressions are reactive (live) and which are static right where you type, as editor inlay hints — the compiler's reactive-vs-static ground truth, surfaced at the cursor.
---

# Reactivity Lens

The **Reactivity Lens** shows you which expressions in your code are **reactive** and which are **static** — rendered as ghost-text inlay hints at the end of each expression, the same surface TypeScript uses for inferred types. It's the compiler's own reactive-vs-static decision, surfaced right where you type.

```tsx
function Counter(props) {
  const count = signal(0)
  return (
    <div>
      {count()}          {/* live */}
      {props.label}      {/* live·prop */}
      {"hello"}          {/* static */}
    </div>
  )
}
```

No other framework shows you this. In a signal framework the single most common bug is **reading a value where you meant to read reactively** — destructuring props, capturing a signal's value in a `const`, or a conditional that hides a signal read. Those mistakes are invisible in the source: the code looks right, it just doesn't update. The Lens makes the difference visible at the cursor, before you run anything.

## What the hints mean

| Hint | Meaning |
| --- | --- |
| `live` | Reactive — this expression re-runs when its signals change (a signal read, an accessor, a reactive child). |
| `live·prop` | A reactive component prop — the compiler wired it as a getter, so reading it in a tracked scope subscribes. |
| `live·attr` | A reactive DOM attribute binding. |
| `static` | **Not** reactive — read once, never updates. If you expected `live` here, something captured the value. |
| `hoisted` | A provably-static subtree the compiler hoisted to module scope (zero per-render cost). |

The one to watch is **`static` where you expected `live`**. `<div>{state}</div>` showing `static` means `state` was captured once (a destructured prop, a `const` snapshot) — the classic "my UI doesn't update" bug, caught at author time instead of in the browser.

## How it works

The Lens is not a linter guess — it's the **actual compiler output**. `analyzeReactivity(code, file)` (from `@pyreon/compiler`) runs the same reactive/static analysis the JSX transform uses to decide what to wrap in a binding, and returns a per-expression verdict. Both compiler backends (Rust + JS) emit a byte-identical `reactivityLens` span sidecar, so the hint you see is exactly what the compiler will do.

`@pyreon/lint`'s LSP server (`pyreon-lint --lsp`) serves those verdicts as [`textDocument/inlayHint`](https://microsoft.github.io/language-server-protocol/) responses — the standard editor protocol for inline type-like annotations.

## Enable it in your editor

The Lens rides the same `pyreon-lint --lsp` server as [Live Program Inlay Hints](/docs/lpih) — set that up once and you get both:

1. Install `@pyreon/lint` in your project: `bun add -d @pyreon/lint`.
2. Run `pyreon-lint --lsp` as an LSP server in your editor. In **VS Code**, use the bundled extension at `packages/tools/lint/vscode` (symlink it into `~/.vscode/extensions`; see its README). In **JetBrains** / any LSP-capable editor, register `pyreon-lint --lsp` as an LSP server for `.ts`/`.tsx`/`.js`/`.jsx` and enable inlay hints.

The server re-analyzes on every inlay-hint request, so hints update as you edit.

## Lens vs LPIH

Both render as inlay hints through the same server, but they answer different questions:

- **Reactivity Lens** (this page) — a **compile-time, structural** verdict: *will* this expression be reactive? (`live` / `static` / `hoisted`). Available with zero runtime, no running app.
- **[Live Program Inlay Hints](/docs/lpih)** — a **runtime** measurement: how many times *did* this signal fire? (`🔥 fired N×`). Requires a running dev app feeding the fire cache.

Use the Lens while writing to confirm your reactivity is wired the way you intended; use LPIH while running to see what actually fired.

## See also

- [Reactivity](/docs/reactivity) — the reactive vs static rules the Lens surfaces.
- [Live Program Inlay Hints](/docs/lpih) — the runtime fire-count companion.
- [`@pyreon/lint`](/docs/lint) — the LSP server + Pyreon-specific rules.
