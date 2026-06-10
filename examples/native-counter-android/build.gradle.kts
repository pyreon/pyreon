// Root Gradle build — only declares plugins for subprojects.
// Mirror of `native-todomvc-android/build.gradle.kts` (same plugin
// versions; Android-counter just needs `com.android.application` +
// `kotlin("android")` + `kotlin.plugin.compose` — no serialization
// since Counter has no persisted state).

plugins {
    id("com.android.application") version "8.7.0" apply false
    kotlin("android") version "2.0.21" apply false
    kotlin("plugin.serialization") version "2.0.21" apply false
}
