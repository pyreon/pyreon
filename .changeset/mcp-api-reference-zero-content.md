---
'@pyreon/mcp': patch
---

MCP `get_api` now covers `@pyreon/zero-content`'s `<Example>` docs primitive + `registerExamples` + `getOrCreateSharedSignal` helpers. Plus a manifest-renderer fix: literal backslashes in `example` / `mistakes` strings are now escaped during template-literal serialization, so manifest entries containing markdown-fenced code (`` ```bash ... ``` ``) round-trip without prematurely closing the generated template literal. Affects 9 api-reference regions that previously skipped this escape pass.
