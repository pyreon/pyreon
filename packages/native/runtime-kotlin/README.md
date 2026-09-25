# @pyreon/native-runtime-kotlin

> **EXPERIMENTAL.** The Kotlin/Jetpack Compose runtime that compiler-emitted Compose code links against on Android. Published to npm — see [Native Packages](https://pyreon.dev/docs/native-packages) for why Kotlin source ships through npm and how a Gradle build resolves it. The Android twin of [`@pyreon/native-runtime-swift`](../runtime-swift/) — same scope, idiomatic Compose + minimal-dependency implementation.

## Installation

You don't install this directly. `@pyreon/create-multiplatform` (`pyreon new --native`) scaffolds a `package.json` dependency on it, and `pyreon-native wire --android-out` writes a resolved, absolute `srcDir` list to `pyreon-native.srcdirs`, which `android/app/build.gradle.kts` reads at Gradle configure time:

```kotlin
sourceSets {
    getByName("main") {
        kotlin {
            file("pyreon-native.srcdirs").readLines().forEach { srcDir(it) }
        }
    }
}
```

`import com.pyreon.runtime.*` in emitted (or hand-written) Kotlin then resolves against it. See [Native Packages](https://pyreon.dev/docs/native-packages#android--a-generated-srcdir-list) for the full wiring mechanism.

## What's here

Ten source files under `src/main/kotlin/com/pyreon/runtime/` (plus tests under `src/test/`):

| File | What it is |
|---|---|
| `PyreonReactivity.kt` | A namespace for the FEW cases that need a small helper the compiler emits onto directly — Compose's `mutableStateOf`/`derivedStateOf` ARE the reactive primitives Pyreon compiles onto, so there's no separate observable layer here. The Kotlin twin of `PyreonReactivity.swift`, deliberately kept small. |
| `PyreonTokens.kt` | Namespace for compiler-generated design tokens from `@pyreon/ui-theme`. |
| `PyreonViewModifier.kt` | `PyreonStylable` — a marker interface for the styler emitter's generated style holders, the Compose analogue of `PyreonStylable` on Swift (Compose's `Modifier` system is extension-function-based rather than class-wrapper-based, so the shape differs even though the intent matches). |
| `PyreonHttp.kt` | The pure, dependency-free half of the HTTP client: `PyreonHttpRequest`/`PyreonHttpResponse` data classes + a `PyreonHttpExecutor` interface. No network, no OkHttp — everything that compiles against the minimal kotlinc validation stubs. |
| `PyreonHttpOkHttp.kt` | The real network edge — an OkHttp-backed `PyreonHttpExecutor` implementation. Split into its own file so `okhttp3` stays attributable to exactly one source (same reason `PyreonWebSocketOkHttp` is separate from `PyreonWebSocket`), and so the per-service kotlinc verify can compile the pure half against stubs without pulling in the real dependency. |
| `PyreonJson.kt` | JSON encode helper for the `<WebView data={signal}>` bridge, mirroring `PyreonJSON.swift`. |
| `PyreonStorageBackends.kt` | The storage BACKEND layer: `PyreonStorageBackend` (a `read`/`write`/`remove` interface over strings), `InMemoryBackend` (the default — process-scoped, used by tests/previews), `FileStorageBackend` (one JSON file, `<dir>/storage.json`, real cross-process persistence), `PyreonStorageRegistry.backend` (the active instance), and `installDefaultStorageBackend` — a policy that only installs a persistent default the first time storage is actually used, and only if the app hasn't already assigned its own backend (Room, DataStore, an encrypted store) in `Application.onCreate`. Dependency-free by design (plain `java.io.File`), so it typechecks AND *runs* under the toolchain-free `kotlinc`-only verify path — Android's storage default has no equivalent on iOS, where `@AppStorage`/`UserDefaults` is a platform given. |
| `PyreonChartCanvas.kt` | The hand-written Compose `Canvas`-based renderer for Pyreon's native charts — the Kotlin twin of `PyreonChartCanvas.swift`: the `PyreonDrawCmd` draw-list contract, a Composable that paints one, and the pie/gauge/animation helpers. |
| `PyreonChartEngine.kt` | **Generated**, not hand-written — a line-for-line Kotlin port of `@pyreon/charts`' pure-geometry TypeScript engine (64 modules), produced by `packages/native/compiler/scripts/gen-chart-engine.ts`. Computes the SAME `PyreonDrawCmd` draw list on Android that the web engine computes in JS. |
| `PyreonAssets.kt` | `pyreonDrawable(name)` — resolves a bundled image by its sanitized asset name via `Resources.getIdentifier`, so the PMTC emit (`painterResource(pyreonDrawable("logo"))`) never needs to know the host app's generated `R` package namespace. No Swift equivalent — iOS bundle image lookup works by string name directly. |

## Usage

Hand-written Kotlin can use any of this directly — the compiler is the primary consumer, but nothing requires going through it:

```kotlin
import com.pyreon.runtime.*

// Storage — first real use installs a persistent backend, unless the app
// already assigned one.
installDefaultStorageBackend { FileStorageBackend(context.filesDir) }
PyreonStorageRegistry.backend.write("theme", "dark")

// <WebView data={…}> bridge
val json = PyreonJson.encode(myValue)
```

## Not here: per-feature runtimes

`useSecureStorage`, `useDatabase`, `useFieldArray`, camera/geolocation/bluetooth/…, `<Flow>`, `<Table>`, sync — none of that lives in this package. Each lives inside the `@pyreon/*` fundamentals package that owns the feature, under its own `native/kotlin/` directory (e.g. `packages/fundamentals/hooks/native/kotlin/com/pyreon/runtime/PyreonDatabase.kt`), and is wired into the Gradle build by `pyreon-native wire` alongside this one. See [Native Packages](https://pyreon.dev/docs/native-packages) for why the split, and [PMTC Library Status & Authoring](https://pyreon.dev/docs/multiplatform-libraries) for which packages cross to native.

## Build / validate locally

Requires `kotlinc` on `PATH` (Kotlin 2.0+). Optionally a JRE for the runtime smoke pass.

```bash
cd packages/native/runtime-kotlin
bun run test
```

`scripts/verify-kotlin.ts` spawns `kotlinc` against the runtime source plus a small set of hand-written stubs for the Compose/kotlinx-serialization/OkHttp API surface the emitter touches — no Android SDK or Gradle needed to prove the Kotlin typechecks. Files that import no `androidx.*`/`android.*`/`kotlinx.*` (the storage backend layer, mostly) are additionally *run*, not just typechecked, so "does a value survive the process" is a question the CI answers for real. The npm scripts gracefully skip when `kotlinc` isn't on `PATH`, so `bun run --filter='*' test` from the repo root doesn't break on cross-platform setups.

## What to read next

- [Native Packages](https://pyreon.dev/docs/native-packages) — this package's place among the other five, and how the Xcode/Gradle wiring actually works.
- [Multi-Platform (PMTC)](https://pyreon.dev/docs/multiplatform) — the compiler that emits code against this runtime.
