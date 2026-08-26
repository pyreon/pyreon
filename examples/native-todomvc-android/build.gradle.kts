// Root Gradle build — only declares plugins for subprojects.
// Mirrors the iOS xcodegen `project.yml` root section.

plugins {
    id("com.android.application") version "8.13.2" apply false
    kotlin("android") version "2.4.10" apply false
    kotlin("plugin.serialization") version "2.4.10" apply false
}
