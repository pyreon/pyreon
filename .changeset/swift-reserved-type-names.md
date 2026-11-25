---
'@pyreon/native-compiler': minor
'@pyreon/native-cli': minor
---

An app type named like a name the Swift runtime spells bare (`Task`, `Error`, `Data`, `URL`, `Color`, `State`, `Group`, `Binding`, `Button`, `User`, `View`, `Text`, `Date`…) no longer breaks the iOS build. An iOS app compiles each dependency's `native/swift` sources into its own target, so such a type shadowed the runtime's name. The Swift emit now spells a user declaration with a reserved name `Name_` (the first line of the emitted file lists each rename, and warnings keep the source spelling). The reserved list is generated from the shipped runtime Swift sources and the Swift stub surface. Kotlin is unchanged: generated code lives in its own package, and `pyreon-native build` now refuses a `--kotlin-package` that names a Pyreon runtime package (`com.pyreon.runtime`, `com.pyreon.router`).
