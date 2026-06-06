---
'@pyreon/zero-content': patch
---

Two markdown-pipeline + runtime bugs surfaced by Playwright comparison of the docs-zero preview vs the original VitePress docs:

1. **Markdown tables produced literal `unhandled mdast node "table"` comments instead of rendering as HTML tables.** remark-gfm parses pipe-tables into `table`/`tableRow`/`tableCell` mdast nodes, but the JSX emitter had no case for any of them — they fell through to the default unhandled-node branch and emitted the visible comment marker in the rendered page. Affects every page with a markdown table (CLAUDE.md-style "package overview" pages: dozens of pages, including the docs Overview).

   Now emits standard `<table><thead><tr><th>...</th></tr></thead><tbody><tr><td>...</td></tr></tbody></table>` with per-column alignment from the `table` node's `align` field threaded into each cell as `style={{ textAlign: 'left'|'right'|'center' }}`. Header cells use `<th>`; body cells use `<td>`. Tables without a body row emit `<thead>` alone.

2. **`<Search>` rendered `[object Object]` as its only content when the dialog opened.** The component's reactive child was `{() => state.open() && <div>...</div>}` — when `state.open()` is true, the `&&` short-circuit returns the VNode itself. Some runtime paths normalize VNodes correctly from accessors; this specific accessor + `&&`-return shape produced a `String(VNode)` toString → `[object Object]`. Switched to a ternary returning `null` on the closed branch, which the runtime treats consistently as "no child" regardless of accessor shape.
