---
'@pyreon/zero': patch
---

ISR cold-miss coalescing no longer waits forever on a hung render. Requests that joined another request's cold-miss render now wait at most `revalidateTimeoutMs` (default 30 s, the same bound background revalidation uses). After that they render for themselves, and new requests stop joining the stuck render. Before, one render that never settled suspended every later request for that page.
