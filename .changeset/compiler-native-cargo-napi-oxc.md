---
'@pyreon/compiler': patch
---

The native (Rust) compiler backend is built against napi 3.16.1 and oxc 0.157.0. napi 3.16.1 avoids a deadlock when a worker loads the addon during `block_on` (napi-rs #3670).
