// PyreonCrdt — the iOS-native port of @pyreon/sync's dependency-free LWW CRDT
// engine (`pyreonAdapter`). Wire-COMPATIBLE with the TypeScript engine: the same
// `{ "ops": [{ map, key, value, clock, actor }] }` JSON messages, the same
// last-writer-wins merge (higher Lamport clock wins; an equal clock is broken by
// the higher actor id). So an iOS peer and a web peer editing the same document
// CONVERGE — 1:1 functionality pairing with the web/`pyreonAdapter` engine.
//
// Scope matches the v1 seam: a map is a flat key → scalar register (whole-value
// replacement). Rich sequence CRDTs (Y.Text/Y.Array) stay on the JS/Yjs engine
// until a native sequence engine (yrs) lands.
//
// This file is the pure engine + JSON codec (no SwiftUI import) so it compiles
// standalone and unit-tests headlessly. The SwiftUI `@Observable` binding + the
// PyreonWebSocket transport wiring layer on top (a thin host, mirroring
// PyreonWebSocket / PyreonHttp).

import Foundation

/// A JSON scalar — the value a v1 register holds. Codable so it round-trips the
/// exact wire bytes the JS engine produces (`JSON.stringify` of a scalar).
public enum PyreonScalar: Equatable {
  case string(String)
  case int(Int)
  case double(Double)
  case bool(Bool)
  case null
}

extension PyreonScalar: Codable {
  public init(from decoder: Decoder) throws {
    let c = try decoder.singleValueContainer()
    if c.decodeNil() {
      self = .null
    } else if let b = try? c.decode(Bool.self) {
      self = .bool(b)
    } else if let i = try? c.decode(Int.self) {
      self = .int(i)
    } else if let d = try? c.decode(Double.self) {
      self = .double(d)
    } else {
      self = .string(try c.decode(String.self))
    }
  }

  public func encode(to encoder: Encoder) throws {
    var c = encoder.singleValueContainer()
    switch self {
    case .string(let s): try c.encode(s)
    case .int(let i): try c.encode(i)
    case .double(let d): try c.encode(d)
    case .bool(let b): try c.encode(b)
    case .null: try c.encodeNil()
    }
  }
}

/// One op on the wire — identical field names + order to the TS `PyreonCrdtOp`.
public struct PyreonCrdtOp: Codable, Equatable {
  public let map: String
  public let key: String
  public let value: PyreonScalar
  public let clock: Int
  public let actor: String
}

/// The `{ ops: [...] }` sync message the transport exchanges.
public struct PyreonSyncMessage: Codable {
  public let ops: [PyreonCrdtOp]
}

private struct Register {
  var value: PyreonScalar
  var clock: Int
  var actor: String
}

/// `true` if `remote` should overwrite `local` under LWW — a deterministic total
/// order identical to the TS `remoteWins` (higher clock; equal clock → higher
/// actor). Every peer resolves a concurrent pair the same way.
private func remoteWins(_ local: Register, _ remoteClock: Int, _ remoteActor: String) -> Bool {
  if remoteClock != local.clock { return remoteClock > local.clock }
  return remoteActor > local.actor
}

/// The pure LWW document engine. Wire-compatible with the TS `PyreonCrdtDoc`.
public final class PyreonCrdtDoc {
  public let actor: String
  private var clock = 0
  private var maps: [String: [String: Register]] = [:]
  private var observers: [Int: (String, Set<String>) -> Void] = [:]
  private var nextObserver = 0

  /// Emits the ops produced by LOCAL writes (the transport relays these). Remote
  /// merges emit nothing here (no echo re-broadcast) — structural, as in TS.
  public var onLocalOps: (([PyreonCrdtOp]) -> Void)?

  public init(actor: String) {
    self.actor = actor
  }

  public func get(_ map: String, _ key: String) -> PyreonScalar? {
    maps[map]?[key]?.value
  }

  public func has(_ map: String, _ key: String) -> Bool {
    maps[map]?[key] != nil
  }

  public func keys(_ map: String) -> [String] {
    Array(maps[map]?.keys ?? [:].keys)
  }

  /// Observe changes to a map — fires with the changed keys after every local or
  /// remote commit that touched it. Returns an unsubscribe.
  @discardableResult
  public func observe(_ map: String, _ cb: @escaping (Set<String>) -> Void) -> () -> Void {
    let id = nextObserver
    nextObserver += 1
    observers[id] = { changedMap, keys in
      if changedMap == map { cb(keys) }
    }
    return { [weak self] in self?.observers.removeValue(forKey: id) }
  }

  /// A local write — stamp a fresh (clock, actor). LWW no-op on an equal scalar.
  public func set(_ map: String, _ key: String, _ value: PyreonScalar) {
    if let existing = maps[map]?[key], existing.value == value { return }
    clock += 1
    let reg = Register(value: value, clock: clock, actor: actor)
    maps[map, default: [:]][key] = reg
    fire(map, [key])
    onLocalOps?([PyreonCrdtOp(map: map, key: key, value: value, clock: reg.clock, actor: reg.actor)])
  }

  /// Merge inbound ops (LWW). Advances the Lamport clock; fires observers; does
  /// NOT re-broadcast (no `onLocalOps`).
  public func applyOps(_ ops: [PyreonCrdtOp]) {
    if ops.isEmpty { return }
    var changedByMap: [String: Set<String>] = [:]
    for op in ops {
      if op.clock > clock { clock = op.clock }
      let local = maps[op.map]?[op.key]
      if let local = local, !remoteWins(local, op.clock, op.actor) { continue }
      if let local = local, local.value == op.value, local.clock == op.clock { continue }
      maps[op.map, default: [:]][op.key] = Register(value: op.value, clock: op.clock, actor: op.actor)
      changedByMap[op.map, default: []].insert(op.key)
    }
    for (map, keys) in changedByMap { fire(map, keys) }
  }

  /// Full state as an op list — each register carries its own stamp, so a state
  /// dump merges convergently in any order. Sent on connect.
  public func encodeState() -> [PyreonCrdtOp] {
    var out: [PyreonCrdtOp] = []
    for (mapName, regs) in maps {
      for (key, reg) in regs {
        out.append(PyreonCrdtOp(map: mapName, key: key, value: reg.value, clock: reg.clock, actor: reg.actor))
      }
    }
    return out
  }

  /// Encode a `{ ops }` message to the exact JSON bytes the TS transport reads.
  public func encodeMessage(_ ops: [PyreonCrdtOp]) -> String {
    let msg = PyreonSyncMessage(ops: ops)
    guard let data = try? JSONEncoder().encode(msg), let s = String(data: data, encoding: .utf8) else {
      return "{\"ops\":[]}"
    }
    return s
  }

  /// Decode + apply a `{ ops }` message from the wire. Malformed input is ignored.
  public func applyMessage(_ json: String) {
    guard let data = json.data(using: .utf8),
      let msg = try? JSONDecoder().decode(PyreonSyncMessage.self, from: data)
    else { return }
    applyOps(msg.ops)
  }

  private func fire(_ map: String, _ keys: Set<String>) {
    for cb in observers.values { cb(map, keys) }
  }
}
