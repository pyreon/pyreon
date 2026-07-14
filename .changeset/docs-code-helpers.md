---
"@pyreon/code": patch
"@pyreon/mcp": patch
---

docs(code): document the 5 missing editor-helper exports in the manifest — `useEditorSignal`, `getAvailableLanguages`, and the theme trio (`darkTheme`/`lightTheme`/`resolveTheme`). Source-verified: `useEditorSignal` wraps `bindEditorToSignal` with `onUnmount` auto-cleanup and returns `void` (use `bindEditorToSignal` for a manual `{ dispose }` lifecycle); `getAvailableLanguages` lists loadable grammar ids (lazy, incl. `'plain'`); `darkTheme` carries the `{ dark: true }` facet that CodeMirror's dark-aware features and the minimap key on (not a CSS class); `resolveTheme` maps `'light'`/`'dark'` and passes a custom `Extension` through. Regenerates the MCP api-reference + docs-site reference page.
