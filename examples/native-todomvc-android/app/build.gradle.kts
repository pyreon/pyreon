// App module Gradle build — single-activity Compose app + kotlinx-
// serialization (so the compiler-emitted `@Serializable data class
// Todo` can JSON-roundtrip via the Saver in `rememberSaveable`).
//
// Mirrors the iOS `project.yml` target block. The `preBuild` task
// shells out to `../scripts/build.sh` so a `gradle build` re-runs the
// Pyreon compile loop the same way Xcode's preBuildScript does.

plugins {
    id("com.android.application")
    kotlin("android")
    kotlin("plugin.serialization")
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21"
}

android {
    namespace = "com.pyreon"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.pyreon.PyreonTodoMVC"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.0.1"
    }

    buildFeatures {
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // Compose BOM pins all transitive Compose deps to one consistent
    // version set — same pattern Google's Compose template uses.
    implementation(platform("androidx.compose:compose-bom:2024.10.01"))
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.runtime:runtime-saveable")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
}

// Pyreon compile step — re-runs the .tsx → .kt compile on every build.
// Mirrors the iOS `preBuildScripts` block in `project.yml`.
tasks.register<Exec>("pyreonCompile") {
    workingDir = projectDir.parentFile
    commandLine("bash", "scripts/build.sh")
}

tasks.named("preBuild") {
    dependsOn("pyreonCompile")
}
