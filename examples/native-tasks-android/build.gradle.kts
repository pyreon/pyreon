// Root Gradle build — only declares plugins for subprojects.

plugins {
    id("com.android.application") version "9.3.2" apply false
    kotlin("android") version "2.4.10" apply false
    kotlin("plugin.serialization") version "2.4.10" apply false
}
