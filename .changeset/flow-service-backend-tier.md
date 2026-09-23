---
'@pyreon/flow': patch
---

Docs and manifest: `@pyreon/flow` is now declared `service-backend` rather than `web-only`, because its default API has a web engine and a native Swift/Kotlin port. The flow docs gain an "iOS and Android" section covering four things: what renders natively, what stays browser-only and why, how parity is verified, and the known platform limits. The README's Multiplatform section had grown stale and contradicted itself; it is rewritten.
