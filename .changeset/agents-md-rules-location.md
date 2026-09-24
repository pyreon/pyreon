---
'@pyreon/compiler': patch
'@pyreon/charts': patch
'@pyreon/feature': patch
'@pyreon/flow': patch
'@pyreon/form': patch
'@pyreon/native-compiler': patch
'@pyreon/native-router-kotlin': patch
'@pyreon/native-router-swift': patch
'@pyreon/atlas': patch
'@pyreon/cli': patch
'@pyreon/lathe': patch
'@pyreon/lint': patch
'@pyreon/loom': patch
'@pyreon/mcp': patch
'@pyreon/connector-document': patch
'@pyreon/ui-core': patch
'@pyreon/zero-content': patch
'@pyreon/zero': patch
'@pyreon/core': patch
'@pyreon/primitives': patch
'@pyreon/kinetic-presets': patch
'@pyreon/unistyle': patch
'@pyreon/native-cli': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

The repo's contributor rules moved from `.claude/rules/` to `.agents/rules/`, and the agent instructions from `CLAUDE.md` to `AGENTS.md`, so they work with any coding agent. Tools that read those files now look in the new places: the MCP `get_anti_patterns` and `get_browser_smoke_status` tools, the lint rule `pyreon/require-browser-smoke-test`, and the `pyreon doctor` doc-claims gate. Messages and comments that pointed at the old paths are updated.

The six `@pyreon/native-*` packages no longer describe themselves on npm as "PRIVATE / EXPERIMENTAL" or "Not published"; they are published, and their descriptions now say what each one is.
