---
'@pyreon/cli': patch
'@pyreon/compiler': patch
'@pyreon/mcp': patch
---

User-facing commands are scoped: `pyreon add @pyreon/loom` / `@pyreon/atlas` print `npx @pyreon/loom …` / `npx @pyreon/atlas …`, the compiler's diagnostics say `npx @pyreon/cli upgrade`, and the MCP missing-catalog message says `bunx @pyreon/atlas scan`. An unscoped `npx loom` / `npx pyreon` runs whatever npm package has that name when ours is not installed locally. The doctor's `doc-claims` gate now checks the string text of published source for such commands, not only docs pages and READMEs.
