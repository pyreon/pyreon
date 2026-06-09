// App module Gradle build — single-activity Compose app for the
// Counter sample. Mirror of `native-todomvc-android/app/build.gradle.kts`
// MINUS kotlinx-serialization (Counter has no persisted state).
//
// The `preBuild` task shells out to `../scripts/build.sh` so a
// `gradle build` re-runs the Pyreon compile loop the same way Xcode's
// preBuildScript does for the iOS counter.

plugins {
    id("com.android.application")
    kotlin("android")
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21"
}

android {
    namespace = "com.pyreon"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.pyreon.PyreonCounter"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.0.1"
        // AndroidJUnit4 runner for the Espresso instrumented test
        // (same instrumentation needed as the TodoMVC sibling).
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
}

dependencies {
    // Compose BOM — same version as native-todomvc-android.
    implementation(platform("androidx.compose:compose-bom:2024.10.01"))
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    // No runtime-saveable (Counter has no persisted state)
    // No kotlinx-serialization (no @Serializable types)

    // Instrumented-test deps. Same shape as native-todomvc-android.
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}

// Pyreon compile step — re-runs the .tsx → .kt compile on every build.
tasks.register<Exec>("pyreonCompile") {
    workingDir = projectDir.parentFile
    commandLine("bash", "scripts/build.sh")
}

tasks.named("preBuild") {
    dependsOn("pyreonCompile")
}
