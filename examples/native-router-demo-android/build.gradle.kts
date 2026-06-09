// Root Gradle build — only declares plugins for subprojects.
// Mirror of `native-todomvc-android/build.gradle.kts` and
// `native-counter-android/build.gradle.kts`.

plugins {
    id("com.android.application") version "8.7.0" apply false
    kotlin("android") version "2.0.21" apply false
}
