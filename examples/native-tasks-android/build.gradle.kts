// Root Gradle build — only declares plugins for subprojects.

plugins {
    id("com.android.application") version "8.7.0" apply false
    kotlin("android") version "2.0.21" apply false
    kotlin("plugin.serialization") version "2.0.21" apply false
}
