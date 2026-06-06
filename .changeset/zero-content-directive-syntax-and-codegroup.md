---
'@pyreon/zero-content': patch
---

Three structural fixes to the markdown pipeline:

1. **VitePress-style `::: name` directive syntax** is now recognized — previously only the canonical `:::name` (no space) worked, so 87 occurrences of `::: code-group`, `::: tip`, etc. across the official Pyreon docs rendered as literal paragraph text. The pipeline now normalizes `::: name` → `:::name` before parsing, accepting both forms transparently.

2. **`<CodeGroup>` (and other HTML-emitted components from remark plugins) now register their import**. Previously, raw HTML nodes containing `<CodeGroup labels={...}>` (emitted by the codegroup plugin) flowed through the JSX emitter verbatim without registering `CodeGroup` for import resolution — produced `ReferenceError: CodeGroup is not defined` at render time once the directive-syntax normalization (point 1) started actually firing the plugin. The emit step now scans raw HTML node values for PascalCase tag references and registers them via the same `mdxComponentRef` callback MDX JSX elements use.

3. **`<CodeGroup>` panels now indicate the active tab via `data-active`** on the `.code-group__panels` container. Consumer stylesheets can target the active panel via `[data-active="N"] > :nth-child(N+1)` rules. Without this, all tab panels rendered stacked.
