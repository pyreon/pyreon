---
"@pyreon/form": minor
"@pyreon/store": minor
"@pyreon/state-tree": minor
"@pyreon/machine": minor
"@pyreon/i18n": minor
"@pyreon/permissions": minor
"@pyreon/query": minor
"@pyreon/native-compiler": minor
"@pyreon/native-runtime-swift": minor
"@pyreon/native-runtime-kotlin": minor
---

Co-locate native runtimes into their own packages.

The Swift/Kotlin runtimes for form, store, state-tree, machine, i18n, permissions,
and query move out of the `@pyreon/native-runtime-*` monolith into each package's
`native/{swift,kotlin}/` (declared via the `pyreon.native` package.json field,
aggregated by `pyreon-native wire`). Framework-base runtimes (reactivity/styling/JSON
helpers) stay in the monolith. A new `scripts/check-native-cosource.ts` gate compiles
and smoke-runs every co-located `.swift`/`.kt` against the stub harness so a relocated
runtime can't rot silently. No API change — this is a source-location move.
