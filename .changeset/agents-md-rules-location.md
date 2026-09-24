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
---

The repo's contributor rules moved from `.claude/rules/` to `.agents/rules/`, and the agent instructions from `CLAUDE.md` to `AGENTS.md`, so they work with any coding agent. Tools that read those files now look in the new places: the MCP `get_anti_patterns` and `get_browser_smoke_status` tools, the lint rule `pyreon/require-browser-smoke-test`, and the `pyreon doctor` doc-claims gate. Messages and comments that pointed at the old paths are updated.
