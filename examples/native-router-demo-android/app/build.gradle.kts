// App module Gradle build — single-activity Compose app for the
// Router demo. Mirror of `native-counter-android/app/build.gradle.kts`
// plus an additional source-set directory for @pyreon/native-router-
// kotlin's Kotlin sources (since router-kotlin ships as source-only,
// no Gradle module).
//
// Phase R1 contract: this Android app uses the SHARED
// `../native-router-demo-ios/src/RouterApp.tsx` source, with the
// router runtime sourced directly from the workspace package's
// `src/main/kotlin/` directory.

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
        applicationId = "com.pyreon.PyreonRouterDemo"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.0.1"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
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

    // Pull @pyreon/native-router-kotlin's sources into THIS module's
    // main source set. The router-kotlin package ships source-only
    // (no Gradle module / no AAR) so consumers either copy the .kt
    // files in or — like here — add the package's `src/main/kotlin/`
    // as an additional Kotlin source root. Mirror of the iOS side's
    // `packages: PyreonRouter: path: ../../packages/native/router-swift`
    // SPM declaration in `native-router-demo-ios/project.yml`.
    sourceSets {
        getByName("main") {
            kotlin {
                srcDir("../../../packages/native/runtime-kotlin/src/main/kotlin")
                srcDir("../../../packages/native/router-kotlin/src/main/kotlin")
            }
        }
    }
}

dependencies {
    // Compose BOM — same version as native-todomvc-android and
    // native-counter-android for consistency across the Android
    // example fleet.
    implementation(platform("androidx.compose:compose-bom:2024.10.01"))
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.runtime:runtime-saveable")
    // Deps required by the runtime-kotlin srcDir sources + M2 material
    // for the emit header's `import androidx.compose.material.*`.
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("androidx.compose.material:material")

    // Instrumented-test deps. Same as the other Android examples.
    // The BOM pins versions PER CONFIGURATION — the implementation-
    // scoped platform() above does NOT reach androidTest's classpath,
    // so without this line ui-test-junit4 resolves VERSIONLESS
    // ("Could not find androidx.compose.ui:ui-test-junit4:" — the
    // first device-CI run to reach dependency resolution caught it).
    androidTestImplementation(platform("androidx.compose:compose-bom:2024.10.01"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}

tasks.register<Exec>("pyreonCompile") {
    workingDir = projectDir.parentFile
    commandLine("bash", "scripts/build.sh")
}

tasks.named("preBuild") {
    dependsOn("pyreonCompile")
}
