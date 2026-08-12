// PyreonStorage unit-level smoke — exercises every public symbol
// the runtime module ships. NOT a real JUnit test suite — JUnit
// + Compose-test artifacts require the full Android stack
// (androidx.test.runner + Robolectric / instrumentation infrastructure)
// that this package intentionally avoids depending on.
//
// What this DOES verify:
//   - Every public symbol is reachable
//   - The InMemoryBackend round-trips strings
//   - The PyreonStorageRegistry exists and can be reconfigured
//
// What this DOESN'T verify (would need Android + JUnit):
//   - rememberPyreonStorage's Composable side effects + recomposition
//   - kotlinx-serialization decode failures (the stubs use string-toString,
//     which never throws — the real plugin generates real serializers that
//     can throw on bad JSON)
//   - DataStore wiring (separate module)
//
// The file structure (package + import + signature shapes) is what
// kotlinc validates against the stubs. That's the gate this test
// supports — proof the API surface compiles, not proof of behaviour.

package com.pyreon.runtime

fun testInMemoryBackendRoundTrip() {
  val backend = InMemoryBackend()
  backend.write("k", "v")
  check(backend.read("k") == "v") { "InMemoryBackend round-trip failed" }
  backend.remove("k")
  check(backend.read("k") == null) { "InMemoryBackend remove failed" }
}

fun testRegistryExists() {
  // Default backend is InMemoryBackend (configured at PyreonStorageRegistry init).
  val initial = PyreonStorageRegistry.backend
  check(initial is InMemoryBackend) { "Default backend should be InMemoryBackend" }

  // Apps can swap the backend (e.g. with a real DataStore wrapper).
  PyreonStorageRegistry.backend = InMemoryBackend()  // No-op swap.
  check(PyreonStorageRegistry.backend is InMemoryBackend) {
    "Swapped backend should still be InMemoryBackend"
  }
}

fun testStorageDecodeOrDefaultEmptyReturnsDefault() {
  val result: String = PyreonStorage.decodeOrDefault<String>(null, "default")
  check(result == "default") { "decodeOrDefault(null) should return default" }
  val result2: String = PyreonStorage.decodeOrDefault<String>("", "default")
  check(result2 == "default") { "decodeOrDefault(empty) should return default" }
}

fun main() {
  testInMemoryBackendRoundTrip()
  testRegistryExists()
  testStorageDecodeOrDefaultEmptyReturnsDefault()
  println("[PyreonStorageTest] all smoke tests passed")
}
