// Root Gradle build — only declares plugins for subprojects.

// AGP 9 runs Kotlin itself ("built-in Kotlin") on the KGP version it depends
// on. The Compose compiler plugin must match KGP exactly, so the classpath
// pins KGP to the same version as the plugin.compose / serialization plugins.
buildscript {
    dependencies {
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.4.21")
    }
}

plugins {
    id("com.android.application") version "9.4.1" apply false
    kotlin("plugin.serialization") version "2.4.21" apply false
}
