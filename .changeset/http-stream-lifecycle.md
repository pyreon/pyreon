---
"@pyreon/http": patch
---

Settle stream cancellation even when transports or asynchronous parsers ignore abort, release unused signal listeners and late response bodies, and scan chunked rows in linear work. Correct SSE control-only IDs, empty-ID resets, retry fields, filtered-event retry recovery, and terminal no-body responses on web, Swift and Kotlin.
