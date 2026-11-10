---
'@pyreon/http': patch
---

A body read on a response that the platform `fetch` returned for a signalled request no longer races a separate promise against the abort signal. `fetch` already ties that body to the same signal, so an abort or timeout errors the read by itself, and the error is still reported as `TimeoutError` / `AbortError`. Every request on the default client carries the 30 s timeout signal, so this is the default path. A body that is not wired that way (a dedupe clone, a mock or a custom transport) keeps the race.
