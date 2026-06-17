---
'@pyreon/create-multiplatform': patch
---

create-multiplatform: the scaffolded Android project now ships a production **release buildType** (R8 minify + shrink, the Play Store path) plus a `proguard-rules.pro` placeholder, instead of a debug-only project. A real `./gradlew assembleRelease` with minify enabled was verified to build clean against the Pyreon Kotlin runtime — its only reflection-sensitive dependency, kotlinx-serialization (useFetch / loader payloads), ships its own R8 keep rules that R8 applies automatically, so the framework needs no manual proguard rules. (iOS already builds under `-configuration Release` whole-module-optimization via the XcodeGen-generated Release config.) So a freshly scaffolded app produces production-optimized builds on both targets out of the box.
