---
"@pyreon/native-compiler": minor
"@pyreon/store": minor
"@pyreon/state-tree": minor
---

Move store and state-tree native recognition, singleton emission and member rewriting into their owning package plugins. The native CLI discovers them through the package manifests; direct compiler users must explicitly load the plugins. Bare compiler transforms no longer lower these libraries. Add generic module receiver, member typing, alias-factory and scoped function emission APIs while preserving the recorded parent output.
