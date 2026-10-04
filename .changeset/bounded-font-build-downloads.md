---
'@pyreon/zero': patch
'@pyreon/mcp': patch
---

Bound Google Fonts self-hosting to one 60-second download budget covering CSS and every font response body. Abort stalled requests, report the deadline, and use the existing CDN fallback so an unavailable provider cannot leave a build waiting indefinitely. Clear the deadline after completion and keep partial downloads out of the cache.

Update the MCP API reference with the font download and fallback contract.
