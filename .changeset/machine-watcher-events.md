---
"@pyreon/machine": patch
---

Fix events sent by a synchronous `watch`/`effect` callback during the machine's batch flush being silently dropped: `send()` now drains its queue after every batch flush until empty (run-to-completion, FIFO), with a `[Pyreon]` runaway guard at 10,000 events per `send()`. Fixes #3798.
