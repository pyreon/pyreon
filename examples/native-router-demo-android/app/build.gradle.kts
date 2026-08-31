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
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.10"
}

android {
    namespace = "com.pyreon"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.pyreon.PyreonRouterDemo"
        minSdk = 26
        targetSdk = 36
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
                srcDir("../../../packages/fundamentals/form/native/kotlin")
                srcDir("../../../packages/fundamentals/store/native/kotlin")
                srcDir("../../../packages/fundamentals/state-tree/native/kotlin")
                srcDir("../../../packages/fundamentals/machine/native/kotlin")
                srcDir("../../../packages/fundamentals/i18n/native/kotlin")
                srcDir("../../../packages/fundamentals/permissions/native/kotlin")
                srcDir("../../../packages/fundamentals/query/native/kotlin")
                srcDir("../../../packages/fundamentals/storage/native/kotlin")
                srcDir("../../../packages/fundamentals/hooks/native/kotlin")
            }
        }
    }
}

dependencies {
    // Compose BOM — same version as native-todomvc-android and
    // native-counter-android for consistency across the Android
    // example fleet.
    // COMPILE-SDK CEILING. AGP 8.13.2 supports compileSdk 36 at most, and an
    // androidx artifact declares its own `minCompileSdk` in AAR metadata — a
    // dependency above the ceiling fails `checkDebugAarMetadata`, not the
    // compile. Verified from the artifacts: compose-bom 2026.08.00 ships
    // compose 1.12 (needs 37) and androidx.core 1.19.0 needs 37, so both are
    // held one release back. Raising either requires AGP 9 + compileSdk 37.
    implementation(platform("androidx.compose:compose-bom:2026.06.01"))
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.runtime:runtime-saveable")
    // Deps required by the runtime-kotlin srcDir sources + M2 material
    // for the emit header's `import androidx.compose.material.*`.
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    // TWO runtime sources in the runtime-kotlin srcDir import okhttp3:
    // PyreonWebSocketOkHttp.kt (the default transport behind the TS-side
    // ws.connect()) and PyreonHttpOkHttp.kt (the executor behind a
    // `useFetch(url, { method })` — the HTTP layer had NO Android edge at all
    // until it was written). Every app compiling the runtime srcDir needs the
    // dep whether or not it uses either (the srcDir compiles all sources).
    implementation("com.squareup.okhttp3:okhttp:5.5.0")
    // media3 — PyreonVideoPlayerAndroid.kt (in the runtime-kotlin srcDir
    // above) imports androidx.media3.* for the <Video> primitive. Same deal
    // as okhttp: every app compiling the srcDir needs the artifacts, video
    // used or not; R8 strips the unused classes from release builds.
    implementation("androidx.media3:media3-exoplayer:1.11.0")
    implementation("androidx.media3:media3-ui:1.11.0")
    // Media-row remote image: the emit lowers <Image src="http…"> to
    // Coil's AsyncImage composable (build.ts adds the conditional
    // import; the DEP lives here — an emit whose import resolves but
    // whose artifact is missing fails only at the real gradle build,
    // the stub-masked-symbol class).
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("androidx.core:core-ktx:1.18.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    implementation("androidx.compose.material:material")

    // Instrumented-test deps. Same as the other Android examples.
    // The BOM pins versions PER CONFIGURATION — the implementation-
    // scoped platform() above does NOT reach androidTest's classpath,
    // so without this line ui-test-junit4 resolves VERSIONLESS
    // ("Could not find androidx.compose.ui:ui-test-junit4:" — the
    // first device-CI run to reach dependency resolution caught it).
    androidTestImplementation(platform("androidx.compose:compose-bom:2026.06.01"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
}

tasks.register<Exec>("pyreonCompile") {
    workingDir = projectDir.parentFile
    commandLine("bash", "scripts/build.sh")
}

tasks.named("preBuild") {
    dependsOn("pyreonCompile")
}

// Kotlin 2.4 turned the `kotlinOptions` DSL into a hard ERROR, not a
// deprecation: "Using 'jvmTarget: String' is an error. Please migrate to the
// compilerOptions DSL." (https://kotl.in/u1r8ln)
//
// This replaces it. It sits OUTSIDE `android { }` deliberately — it configures
// the Kotlin extension, not AGP. The enum is fully qualified so the file needs
// no top-of-script `import`, which in a .kts must precede even `plugins { }`.
kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}
