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
        // Phase-2.2 instrumented-test runner. AndroidJUnit4 is the
        // standard runner for any test needing an Android context
        // (here: a real MainActivity launch + real Compose composition
        // tree). Without this, `gradle connectedAndroidTest` reports
        // "no tests found" even when the `androidTest` source set
        // has tests.
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
    // Compose BOM pins all transitive Compose deps to one consistent
    // version set — same pattern Google's Compose template uses.
    implementation(platform("androidx.compose:compose-bom:2024.10.01"))
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.runtime:runtime-saveable")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    // Phase-2.2 instrumented-test deps. All three live in the same
    // androidx test family; the Compose BOM above already pins the
    // versions of the two Compose-test packages so no explicit
    // version is needed here.
    //
    // `ui-test-junit4` is the Compose test rule entry point
    // (createAndroidComposeRule + onNodeWithTag + the JUnit4 glue).
    // `ui-test-manifest` MUST live in debugImplementation (not
    // androidTestImplementation): it's an APK-side test manifest
    // merged at debug-build time so the host activity has the
    // permissions the test rule needs. Pinning it to
    // androidTestImplementation produces the classic "missing
    // <activity android:name=androidx.activity.ComponentActivity>"
    // runtime error on test launch.
    // `androidx.test.ext:junit` provides the AndroidJUnit4 runner
    // class referenced by `testInstrumentationRunner` above.
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
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
