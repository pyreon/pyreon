---
"@pyreon/mcp": patch
---

MCP `get_api` now serves `@pyreon/atlas` — the manifest's marker pair was
missing, so the workbench's API reference (scan / dev / verify-browser /
createAtlas / authored scenarios, with their mistake catalogs) never reached
AI assistants despite being generated for llms.txt.
