/**
 * The compile-gate stubs the `@pyreon/sync` lowering's emit needs beyond the SwiftUI / Compose stub bundle: the CRDT
 * doc, its map handle and op log, the scalar type, and the `PyreonSyncedSignal` facade a `syncedSignal` declaration
 * emits. They mirror the REAL runtimes (`@pyreon/sync/native`) exactly — a superset stub masks real breakage, a
 * narrower one manufactures it.
 *
 * Appended to the bundle only for an emit that names a runtime type (see {@link syncStubs}); the compiler never reads them.
 */

import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'

export const SYNC_SWIFT_STUBS = `// @pyreon/sync — CRDT doc + synced-signal facade. Mirrors the real
// PyreonCrdt.swift / PyreonSyncedSignal.swift SURFACE (not a superset); the
// stub omits @available so the emitted View compiles on any deployment target.
public enum PyreonScalar: Equatable {
  case string(String)
  case int(Int)
  case double(Double)
  case bool(Bool)
  case null
}
// A stub that is NARROWER than the runtime rejects CORRECT emit, and one that
// is WIDER hides a missing symbol. Both halves of the surface below are
// therefore mirrored from PyreonCrdt.swift, not approximated to what the
// emitter happens to produce today.
extension PyreonScalar: Codable {}
public struct PyreonCrdtOp: Codable, Equatable {
  public let map: String
  public let key: String
  public let value: PyreonScalar
  public let clock: Int
  public let actor: String
}
public struct PyreonCrdtMap {
  public func get(_ key: String) -> PyreonScalar? { nil }
  public func has(_ key: String) -> Bool { false }
  public func keys() -> [String] { [] }
  public func set(_ key: String, _ value: PyreonScalar) {}
  public func set(_ key: String, _ value: String) {}
  public func set(_ key: String, _ value: Int) {}
  public func set(_ key: String, _ value: Double) {}
  public func set(_ key: String, _ value: Bool) {}
  public func observe(_ cb: @escaping (Set<String>) -> Void) -> () -> Void { {} }
}
public final class PyreonCrdtDoc {
  public var onLocalOps: (([PyreonCrdtOp]) -> Void)?
  public init(actor: String) {}
  public func getMap(_ name: String) -> PyreonCrdtMap { PyreonCrdtMap() }
  public func get(_ map: String, _ key: String) -> PyreonScalar? { nil }
  public func has(_ map: String, _ key: String) -> Bool { false }
  public func keys(_ map: String) -> [String] { [] }
  public func set(_ map: String, _ key: String, _ value: PyreonScalar) {}
  public func observe(_ map: String, _ cb: @escaping (Set<String>) -> Void) -> () -> Void { {} }
  public func applyOps(_ ops: [PyreonCrdtOp]) {}
  public func encodeState() -> [PyreonCrdtOp] { [] }
  public func encodeMessage(_ ops: [PyreonCrdtOp]) -> String { "" }
  public func applyMessage(_ json: String) {}
}
public protocol PyreonScalarConvertible: Equatable {
  init?(pyreonScalar: PyreonScalar)
  var pyreonScalar: PyreonScalar { get }
}
extension String: PyreonScalarConvertible {
  public init?(pyreonScalar: PyreonScalar) { nil }
  public var pyreonScalar: PyreonScalar { .string(self) }
}
extension Double: PyreonScalarConvertible {
  public init?(pyreonScalar: PyreonScalar) { nil }
  public var pyreonScalar: PyreonScalar { .double(self) }
}
extension Bool: PyreonScalarConvertible {
  public init?(pyreonScalar: PyreonScalar) { nil }
  public var pyreonScalar: PyreonScalar { .bool(self) }
}
public let PYREON_SYNCED_DEFAULT_MAP = "pyreon"
public final class PyreonSyncedSignal<T: PyreonScalarConvertible> {
  public private(set) var value: T
  public init(doc: PyreonCrdtDoc, map: String = PYREON_SYNCED_DEFAULT_MAP, key: String, initial: T) {
    self.value = initial
  }
  public func callAsFunction() -> T { value }
  public func set(_ v: T) {}
  // The runtime ships this and the stub did not, so a correct
  // \`s.dispose()\` was rejected by the type gate.
  public func dispose() {}
}
`

export const SYNC_KOTLIN_STUBS = `// @pyreon/sync — CRDT doc + synced-signal facade. Mirrors the real
// PyreonCrdt.kt / PyreonSyncedSignal.kt SURFACE.
// A stub NARROWER than the runtime rejects CORRECT emit; one that is WIDER
// hides a missing symbol. Mirrored from PyreonCrdt.kt, not approximated to
// what the emitter happens to produce today — \`Null\` and the whole map facade
// were both absent while this comment already claimed to mirror the surface.
sealed class PyreonScalar {
  data class Str(val v: String) : PyreonScalar()
  data class Num(val v: Double) : PyreonScalar()
  data class Bool(val v: Boolean) : PyreonScalar()
  object Null : PyreonScalar()
}
data class PyreonCrdtOp(
  val map: String,
  val key: String,
  val value: PyreonScalar,
  val clock: Int,
  val actor: String,
)
class PyreonCrdtMap {
  fun get(key: String): PyreonScalar? = null
  fun has(key: String): Boolean = false
  fun keys(): List<String> = emptyList()
  fun set(key: String, value: PyreonScalar) {}
  fun set(key: String, value: String) {}
  fun set(key: String, value: Long) {}
  fun set(key: String, value: Int) {}
  fun set(key: String, value: Double) {}
  fun set(key: String, value: Boolean) {}
  fun observe(cb: (Set<String>) -> Unit): () -> Unit = {}
}
class PyreonCrdtDoc(val actor: String) {
  var onLocalOps: ((List<PyreonCrdtOp>) -> Unit)? = null
  fun getMap(name: String): PyreonCrdtMap = PyreonCrdtMap()
  fun get(map: String, key: String): PyreonScalar? = null
  fun has(map: String, key: String): Boolean = false
  fun keys(map: String): List<String> = emptyList()
  fun set(map: String, key: String, value: PyreonScalar) {}
  fun observe(map: String, cb: (Set<String>) -> Unit): () -> Unit = {}
  fun applyOps(ops: List<PyreonCrdtOp>) {}
  fun encodeState(): List<PyreonCrdtOp> = emptyList()
  fun encodeMessage(ops: List<PyreonCrdtOp>): String = ""
  fun applyMessage(json: String) {}
}
const val PYREON_SYNCED_DEFAULT_MAP = "pyreon"
class PyreonSyncedSignal<T>(
  doc: PyreonCrdtDoc,
  key: String,
  initial: T,
  map: String = PYREON_SYNCED_DEFAULT_MAP,
) {
  private var _value: T = initial
  val value: T get() = _value
  operator fun invoke(): T = _value
  fun set(v: T) { _value = v }
  // Mirror of the runtime's dispose(); its absence rejected correct code.
  fun dispose() {}
}
`

/** The CRDT / synced-signal compile-gate stubs, appended only to an emit that names a type they declare. */
export const syncStubs: StubAugmentation = {
  swift: (source) => (/\bPyreon(?:CrdtDoc|SyncedSignal|Scalar)\b/.test(source) ? SYNC_SWIFT_STUBS : ''),
  kotlin: (source) => (/\bPyreon(?:CrdtDoc|SyncedSignal|Scalar)\b/.test(source) ? SYNC_KOTLIN_STUBS : ''),
}
