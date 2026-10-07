/**
 * The compile-gate stubs the `@pyreon/storage` lowering's emit needs beyond the SwiftUI / Compose stub bundle: the
 * `PyreonAppStorage` property wrapper (the Codable bridge for values SwiftUI's own `@AppStorage` cannot hold) and
 * Compose's `rememberPyreonStorage`. They mirror the REAL runtimes (`@pyreon/storage/native`) exactly — a superset
 * stub masks real breakage, a narrower one manufactures it. SwiftUI's own `AppStorage` and Compose's
 * `rememberSaveable` model the platforms, not this library, and stay in the core bundle.
 *
 * Appended to the bundle only for an emit that names a runtime type (see {@link storageStubs}); the compiler never reads them.
 */

import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'

export const STORAGE_SWIFT_STUBS = `// PyreonAppStorage — the Codable-bridge wrapper a non-scalar persisted signal uses (a struct or a list; scalars use
// SwiftUI's own @AppStorage). Same UserDefaults backing and Binding<T> projection as the real one.
@propertyWrapper public struct PyreonAppStorage<Value> {
  public init(wrappedValue: Value, _ key: String) {}
  public var wrappedValue: Value { get { fatalError() } nonmutating set {} }
}`

export const STORAGE_KOTLIN_STUBS = `// rememberPyreonStorage<T>(key, default) — the one-line call a non-native persisted signal emits, replacing the
// previous 4-line Saver boilerplate. The real implementation (InMemoryBackend / DataStoreBackend pluggable
// backends + a kotlinx-serialization JSON round-trip) ships in @pyreon/storage; this stubs just enough surface
// for kotlinc to typecheck the emit.
@Composable
fun <T : Any> rememberPyreonStorage(
  key: String,
  initial: T,
): MutableState<T> = mutableStateOf(initial)`

/** The persistence compile-gate stubs, appended only to an emit that names a type they declare. */
export const storageStubs: StubAugmentation = {
  swift: (source) => (/\bPyreonAppStorage\b/.test(source) ? STORAGE_SWIFT_STUBS : ''),
  kotlin: (source) => (/\brememberPyreonStorage\b/.test(source) ? STORAGE_KOTLIN_STUBS : ''),
}
