---
'@pyreon/create-multiplatform': minor
---

Scaffolded Android apps now build on the current Android stack: AGP 9.4.1 (needs Gradle 9.6+), Kotlin 2.4.21, compileSdk 37, Compose BOM 2026.09.00, and current androidx, kotlinx, okhttp 5 and media3 releases. The template was previously on AGP 8.7 and Kotlin 2.0.21, and its `kotlinOptions` block is an error under Kotlin 2.4.

AGP 9 runs Kotlin itself, so the generated build no longer applies `kotlin("android")`. JVM target configuration moves to `kotlin { compilerOptions { … } }`. Existing apps that upgrade need Gradle 9.6 or newer.

The generated README no longer tells you to run `./gradlew`: no Gradle wrapper is generated, so it now says to use a system `gradle` (9.6+) and shows `gradle assembleDebug`.
