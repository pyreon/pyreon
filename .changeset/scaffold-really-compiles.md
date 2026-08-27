---
'@pyreon/native-compiler': minor
'@pyreon/create-multiplatform': patch
---

`validateSwiftWithStubs` is exported from `@pyreon/native-compiler`. It is the
Linux-viable TYPE gate — it strips the emit's framework imports, prepends stubs
mirroring the real SwiftUI / PyreonRuntime surface, and type-checks — and a
consumer that GENERATES Pyreon source needs it: `validateSwift` is parse-only,
and `validateSwiftTypecheck` needs a real Apple SDK.

The scaffolder now uses it. Its two specs were named "compiles to valid
SwiftUI" / "…Compose" and asserted only that the emit contained some strings —
a shape check wearing a compile's name. The scaffolded app is the
highest-stakes source in the repo, so it now goes through swiftc and kotlinc,
and is asserted to emit no warnings on either target.
