---
'@pyreon/cli': patch
'@pyreon/mcp': patch
'@pyreon/core': patch
'@pyreon/rx': patch
'@pyreon/virtual': patch
'@pyreon/testing': patch
'@pyreon/document': patch
'@pyreon/code': patch
'@pyreon/url-state': patch
'@pyreon/i18n': patch
'@pyreon/a11y': patch
'@pyreon/hooks': patch
'@pyreon/loom': patch
'@pyreon/document-primitives': patch
'@pyreon/ui-core': patch
'@pyreon/zero-content': patch
'@pyreon/atlas': patch
'@pyreon/lathe': patch
'@pyreon/kinetic-presets': patch
---

Documentation and API-reference corrections (manifests feed `llms.txt` and MCP `get_api`). Every docs page and README now runs Pyreon CLIs through their scoped package (`npx @pyreon/lathe init`, not `npx lathe init`, which ran an unrelated npm package), and `pyreon doctor`'s doc-claims gate fails on an unscoped `npx` / `bunx` / `pnpm dlx` / `yarn dlx` command for one of our bins. The gate also checks the lint VS Code README's rule and category counts, the rx function count, the table feature count and the document-primitives format count. MCP `validate`'s text output now includes the column (`line 3, column 9`).
