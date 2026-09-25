---
'@pyreon/native-compiler': patch
---

Endpoint path templates honour `@pyreon/http`'s `\:` literal-colon escape, so a custom-verb path (`/v1/:name\:cancel`) bakes the same URL natively as on the web instead of demanding a phantom `cancel` parameter and staying web.

The Kotlin compile daemon no longer keeps its host process alive: a CLI that validated Kotlin (e.g. `lathe generate --target multiplatform`) finished its work and then hung forever on the referenced JVM child and its pipes. The child and its streams are now unreferenced; the existing `exit` hook stops the JVM.

The endpoint call-site options `form`, `multipart`, `body` and `cookies` are named in the "no native lowering" table, with a reason each. Before, they fell through to a generic "not part of the lowered endpoint surface" warning.
