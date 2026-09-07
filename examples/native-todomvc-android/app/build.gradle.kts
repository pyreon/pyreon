// App module Gradle build — single-activity Compose app + kotlinx-
// serialization (so the compiler-emitted `@Serializable data class
// Todo` can JSON-roundtrip via the Saver in `rememberSaveable`).
//
// Mirrors the iOS `project.yml` target block. The `preBuild` task
// shells out to `../scripts/build.sh` so a `gradle build` re-runs the
// Pyreon compile loop the same way Xcode's preBuildScript does.

// java.util.Properties by explicit import — inside android {} the bare
// `java` resolves to Gradle's JavaPluginExtension accessor, shadowing the
// package root (`Unresolved reference 'util'`).
import java.util.Properties

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
        applicationId = "com.pyreon.PyreonTodoMVC"
        minSdk = 26
        targetSdk = 36
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

    // ── Release lane (Release & distribution matrix row) ──
    //
    // A release build that cannot be SIGNED cannot be INSTALLED, so an
    // unsigned `assembleRelease` proves compilation and nothing more.
    // The keystore is SELF-GENERATED on demand (scripts/
    // ensure-release-keystore.sh → keystore.properties + release.keystore,
    // both gitignored) — credential-free by design: Play App Signing
    // re-signs uploads, so a locally-generated key is the correct
    // default for install-and-run proof, and a real upload key drops
    // into the same keystore.properties shape without a build edit.
    signingConfigs {
        create("release") {
            val props = rootProject.file("keystore.properties")
            if (props.exists()) {
                val ks = Properties().apply { props.inputStream().use { load(it) } }
                storeFile = rootProject.file(ks.getProperty("storeFile"))
                storePassword = ks.getProperty("storePassword")
                keyAlias = ks.getProperty("keyAlias")
                keyPassword = ks.getProperty("keyPassword")
            }
            // No keystore.properties → storeFile stays null and
            // `assembleRelease` fails LOUDLY at the signing step naming
            // this config — run scripts/ensure-release-keystore.sh first.
            // Never fall back to the debug key: a debug-signed "release"
            // masks exactly the signing path this lane exists to prove.
        }
    }

    buildTypes {
        getByName("release") {
            // Minified + optimized — the R8 pass is the POINT: reflection
            // and keep-rule breakage only surfaces in a minified build
            // (kotlinx-serialization ships its own auto-applied R8 rules;
            // this build type is what verifies they actually hold against
            // the runtime srcDirs above).
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            signingConfig = signingConfigs.getByName("release")
            // Test-APK-only rules (see proguard-test-rules.pro): androidx.test
            // references compile-only errorprone annotations R8 error-flags
            // when the androidTest APK is minified under testBuildType=release.
            testProguardFiles("proguard-test-rules.pro")
            // Runner-startup keep, applied ONLY in the release-test lane —
            // the shipping config never sees it (see the .pro file's header
            // for the AGP-dedup + R8-strip mechanism it closes).
            if (project.hasProperty("pyreonReleaseTests")) {
                proguardFile("proguard-releasetest-keep.pro")
            }
        }
    }

    // Release-mode device proof: `-PpyreonReleaseTests` points the
    // instrumented suite at the SIGNED release build — same-certificate
    // instrumentation (both APKs signed with the release key) is what
    // makes a non-debuggable app testable; the test uses
    // createAndroidComposeRule<MainActivity>, the app's own manifest
    // activity, so no ui-test-manifest is merged. Stated precisely, the
    // TESTED build differs from a shipping release in exactly two ways:
    // the test APK beside it, and proguard-releasetest-keep.pro's
    // -dontshrink (obfuscation + optimization stay ON — see that file's
    // header for the AGP-dedup mechanism that forces it). Behavior under
    // full SHRINKING is covered by scripts/release-smoke.sh against the
    // untouched artifact.
    testBuildType = if (project.hasProperty("pyreonReleaseTests")) "release" else "debug"

    // Compile the @pyreon/native runtime + router Kotlin sources into
    // the app module. The PMTC emit imports `com.pyreon.runtime.*`
    // (useStorage → rememberPyreonStorage, Phase 2.5 #891) and
    // `com.pyreon.router.*` — without these srcDirs the generated
    // TodoApp.kt fails compile with `Unresolved reference 'runtime'`,
    // the failure that kept the native-device nightly red from its
    // first run (2026-05-29) until this fix. Mirrors the iOS
    // project.yml's local-SPM `packages:` references and the
    // native-tasks-android router srcDir shape.
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
    // Compose BOM pins all transitive Compose deps to one consistent
    // version set — same pattern Google's Compose template uses.
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
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    // PyreonWebSocketOkHttp.kt (in the runtime-kotlin srcDir above) imports
    // okhttp3 — the default websocket transport backing the TS-side
    // ws.connect(). Every app compiling the runtime srcDir needs the dep,
    // websockets used or not (the srcDir compiles all runtime sources).
    implementation("com.squareup.okhttp3:okhttp:5.5.0")
    // media3 — PyreonVideoPlayerAndroid.kt (in the runtime-kotlin srcDir
    // above) imports androidx.media3.* for the <Video> primitive. Same deal
    // as okhttp: every app compiling the srcDir needs the artifacts, video
    // used or not; R8 strips the unused classes from release builds.
    implementation("androidx.media3:media3-exoplayer:1.11.0")
    implementation("androidx.media3:media3-ui:1.11.0")
    // Needed by the runtime-kotlin srcDir sources (see sourceSets above):
    // PyreonPermissions uses androidx.core.content.ContextCompat;
    // PyreonFetch / PyreonNetworkStatus use kotlinx-coroutines. Compose
    // brings coroutines-android transitively, but the runtime sources
    // import kotlinx.coroutines.* directly — pin it explicitly so the
    // compile classpath doesn't depend on transitive luck.
    implementation("androidx.core:core-ktx:1.18.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    // material (M2) — the PMTC emit's Compose dispatcher uses
    // androidx.compose.material.* widgets (Text/Button/TextField/
    // Checkbox from `import androidx.compose.material.*` in the
    // generated header), which material3 does NOT provide.
    implementation("androidx.compose.material:material")

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

// Pyreon compile step — re-runs the .tsx → .kt compile on every build.
// Mirrors the iOS `preBuildScripts` block in `project.yml`.
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
