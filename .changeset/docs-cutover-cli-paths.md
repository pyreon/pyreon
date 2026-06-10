---
'@pyreon/cli': patch
'@pyreon/mcp': patch
---

Path updates in `pyreon doctor`'s doc-claims gate + the MCP `get_pattern` tool: the docs site moved from `docs/docs/<topic>.md` to `docs/src/content/docs/<topic>.md` (legacy VitePress → Pyreon-native cutover). The doc-claims gate now reads from the new location; the MCP `get_pattern` candidate paths list includes the new `docs/src/content/docs/patterns/` location while keeping legacy locations as fallbacks for downstream consumers on older repo layouts.
