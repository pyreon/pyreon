// Root Gradle build — only declares plugins for subprojects.
// Mirror of `native-todomvc-android/build.gradle.kts` and
// `native-counter-android/build.gradle.kts`.

plugins {
    id("com.android.application") version "9.4.1" apply false
    kotlin("android") version "2.4.20" apply false
    kotlin("plugin.serialization") version "2.4.20" apply false
}
