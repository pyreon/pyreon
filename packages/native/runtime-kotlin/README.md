# @pyreon/native-runtime-kotlin

> **PRIVATE / EXPERIMENTAL.** Kotlin runtime that compiler-emitted Compose code links against on Android. Parallel to [`@pyreon/native-runtime-swift`](../runtime-swift/); same two-tier API surface, idiomatic Compose + kotlinx-serialization implementation.

## Goal

Provide the **runtime half** of Pyreon's Android persistence story — the layer the PMTC compiler's Kotlin emit will eventually call into instead of generating verbose `Saver` boilerplate inline.

Today the compiler emits this per `useStorage<T>('key', default)` source call:

```kotlin
var todos by rememberSaveable(saver = Saver<List<Todo>, String>(
    save = { Json.encodeToString(it) },
    restore = { Json.decodeFromString<List<Todo>>(it) },
)) { mutableStateOf<List<Todo>>(listOf()) }
```

That's 4 lines of saver boilerplate per slot, AND `rememberSaveable` only survives configuration changes (rotation) — NOT app launches. For real cross-launch persistence, Android apps need `SharedPreferences` or `DataStore`.

`rememberPyreonStorage` collapses both concerns:

```kotlin
import com.pyreon.runtime.rememberPyreonStorage

@Composable
fun TodoApp() {
    var todos by rememberPyreonStorage("todos", listOf<Todo>())
    // …
}
```

Same `MutableState<T>` projection (so Compose recomposes on writes). Backend is pluggable: `InMemoryBackend` (default, ships here, useful for tests / previews) or `DataStoreBackend` (separate module, real cross-launch persistence — requires Android SDK).

## API surface — mirrors `@pyreon/native-runtime-swift`

| Swift                                        | Kotlin                                      |
| -------------------------------------------- | ------------------------------------------- |
| `@PyreonAppStorage("k") var x: T = d`        | `var x by rememberPyreonStorage("k", d)`    |
| `PyreonStorage.read(T.self, key:)`           | `PyreonStorage.read<T>(key)`                |
| `PyreonStorage.write(_:key:)`                | `PyreonStorage.write(key, value)`           |
| `PyreonStorage.remove(key:)`                 | `PyreonStorage.remove(key)`                 |
| `PyreonStorage.decodeOrDefault(d, default:)` | `PyreonStorage.decodeOrDefault(d, default)` |

**Failure semantics match exactly**: silent fallback to default on decode failure, silent drop on write failure. Use the throwing escape hatches when you need visibility.

## Backend abstraction

```kotlin
interface PyreonStorageBackend {
    fun read(key: String): String?
    fun write(key: String, value: String)
    fun remove(key: String)
}
```

Concrete implementations shipped here:

- **`InMemoryBackend`** — `MutableMap<String, String>` process-scope storage. Loses data on process exit but survives the application's lifetime. Default for unit tests + Composable previews + the kotlinc validation harness.

**Not shipped here (requires Android SDK)**:

- **`DataStoreBackend`** — wraps `androidx.datastore.preferences.preferencesDataStore` for real cross-launch persistence. Implementation lives in a separate module (TBD) because pulling in `androidx.*` would force every contributor to install Android Studio + SDK just to verify a Kotlin source file parses. Real apps wire `PyreonStorageRegistry.backend = DataStoreBackend(context)` in their `Application.onCreate` or a Hilt singleton.

## Build / validate locally

Requires `kotlinc` on PATH (Kotlin 2.0+ recommended). Optionally Java for the runtime smoke pass.

```bash
cd packages/native/runtime-kotlin
bun run test
```

The script (`scripts/verify-kotlin.ts`):

1. Spawns kotlinc with the runtime source + smoke test + stubs for `androidx.compose.runtime`, `kotlinx.serialization`, `kotlinx.serialization.json`
2. If `java` is available, runs the resulting JAR's `main()` smoke
3. Skips gracefully when `kotlinc` is absent (matches `runtime-swift`'s SwiftPM skip pattern)

## Verifiable locally vs requires Android SDK

| Layer                                                                                  | Verifiable now?        | How                                                                   |
| -------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------- |
| `PyreonStorage.kt` typechecks against the Compose + kotlinx-serialization API surfaces | ✅                     | `bun run test` via kotlinc + stubs                                    |
| `InMemoryBackend` round-trips strings                                                  | ✅ (when Java present) | smoke `main()` in the JAR                                             |
| `rememberPyreonStorage` Composable surface                                             | ✅ (typecheck only)    | kotlinc validates the signature against the Compose stubs             |
| `rememberPyreonStorage` recomposition behaviour                                        | ❌                     | needs real Compose runtime                                            |
| `DataStoreBackend` (cross-launch persistence)                                          | ❌                     | needs Android SDK + emulator/device                                   |
| Real kotlinx-serialization JSON round-trip                                             | ❌ (stubs only)        | needs the kotlinx-serialization plugin (runtime annotation processor) |

The honest framing: **API surface is real and validated** through kotlinc. **Runtime behaviour is real for `InMemoryBackend` and stubbed for the rest**. End-to-end Android validation is a documented gap that needs Android CI infrastructure to close.

## Privacy

Marked `"private": true`; not published to npm. Internal-only until PMTC reaches publish readiness.

## Phase 0 dependency map

This package is the foundation for the Phase 2.5 compiler-emit simplification (rewrites `useStorage<T>('key', default)` to `rememberPyreonStorage("key", default)` instead of the inline `Saver` boilerplate). Until that emit change lands, this runtime is usable by hand-written Compose code.
