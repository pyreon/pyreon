---
'@pyreon/sync': patch
---

Document that `connectYDocs(a, b)` (and the test-only `connectFakeDocs`) is a pairwise link, not a relay. It forwards edits made on either doc and never re-forwards an update a doc received, so a chain `device1 ↔ relay ↔ device2` built from two calls does not carry live edits end to end. For more than two documents, link every pair directly, or use `connectViaWebSocket` with `createSyncServer` (whose server relays) or `connectViaBroadcastChannel`. No behaviour change; `connectYDocs` now has a manifest entry, and a test locks the pairwise contract.
