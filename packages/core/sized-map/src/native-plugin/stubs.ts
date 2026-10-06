/**
 * The compile-gate stubs the `@pyreon/sized-map` lowering's emit needs beyond the SwiftUI / Compose stub bundle: the
 * `PyreonSizedMap` class a `new SizedMap<K, V>({ … })` emits. They mirror the REAL runtimes (`@pyreon/sized-map/native`)
 * exactly — a superset stub masks real breakage, a narrower one manufactures it.
 *
 * Appended to the bundle only for an emit that names the runtime type (see {@link sizedMapStubs}); the compiler never reads them.
 */

import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'

export const SIZED_MAP_SWIFT_STUBS = `// PyreonSizedMap — mirrors packages/core/sized-map/native/swift/PyreonSizedMap.swift.
// Signature copied from the shipped class, not approximated: maxEntries is
// required and lru defaults, which is what makes a snippet passing only
// maxEntries compile while a maxSize typo still fails.
public final class PyreonSizedMap<Key: Hashable, Value> {
  public init(maxEntries: Int, lru: Bool = false) {}
  public var size: Int { 0 }
  public func get(_ key: Key) -> Value? { nil }
  public func set(_ key: Key, _ value: Value) {}
  public func has(_ key: Key) -> Bool { false }
  @discardableResult public func delete(_ key: Key) -> Bool { false }
  public func clear() {}
  public func keys() -> [Key] { [] }
  public func values() -> [Value] { [] }
  public func entries() -> [(Key, Value)] { [] }
}
`

export const SIZED_MAP_KOTLIN_STUBS = `// PyreonSizedMap — mirrors packages/core/sized-map/native/kotlin/.../PyreonSizedMap.kt.
// The Swift stub gained this earlier; the Kotlin one never did, so a snippet
// using SizedMap compiled on one target and not the other. Signature copied
// from the shipped class: maxEntries required, lru defaulted.
class PyreonSizedMap<K, V>(maxEntries: Long, private val lru: Boolean = false) {
  val size: Long get() = 0L
  fun get(key: K): V? = null
  fun set(key: K, value: V) {}
  fun delete(key: K): Boolean = false
  fun has(key: K): Boolean = false
  fun clear() {}
  fun keys(): List<K> = emptyList()
  fun values(): List<V> = emptyList()
  fun entries(): List<Pair<K, V>> = emptyList()
}
`

/** The sized-map compile-gate stubs, appended only to an emit that names the type they declare. */
export const sizedMapStubs: StubAugmentation = {
  swift: (source) => (/\bPyreonSizedMap\b/.test(source) ? SIZED_MAP_SWIFT_STUBS : ''),
  kotlin: (source) => (/\bPyreonSizedMap\b/.test(source) ? SIZED_MAP_KOTLIN_STUBS : ''),
}
