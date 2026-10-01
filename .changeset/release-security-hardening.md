---
"@pyreon/zero": patch
"@pyreon/lathe": patch
"@pyreon/native-compiler": patch
---

Keep private session and preview HTML out of the PWA offline cache, remove the legacy runtime cache on activation, and normalize preview redirects before allowing same-origin paths. Public navigation caching now requires an explicit `Cache-Control: public` response.

Bound generated webhook request bodies to 1 MiB by default, with a configurable `bodyLimit` enforced on both declared length and streamed bytes before authentication or dispatch. Refuse inherited property names when selecting webhook schemas and handlers.

Preserve optional member-read types in native computed values, distinguish nested Swift structs by their complete typed shape, and emit explicitly annotated zero-argument value helpers as native functions. Align the native validation stubs with SwiftUI border overlays and Compose per-side padding.
