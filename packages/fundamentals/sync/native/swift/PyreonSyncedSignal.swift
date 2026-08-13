// PyreonSyncedSignal — the SwiftUI side of `@pyreon/sync`'s `syncedSignal`.
//
// Web shape:
//     const doc = createCrdtDoc()
//     const title = syncedSignal({ doc, key: 'title', initial: '' })
//     title()          // read (a normal Signal<T> accessor)
//     title.set('Hi')  // write — one CRDT op
//
// On iOS the same source lowers to a `PyreonCrdtDoc` (the LWW-CRDT engine,
// wire-compatible with web + Android) plus, per synced signal, a
// `PyreonSyncedSignal<T>` bound to ONE scalar entry in a shared map. Multiple
// synced signals over the SAME `doc` share state, exactly as on web.
//
// `@Observable`, so a SwiftUI view reading `title()` re-renders when the value
// changes — whether the change came from `title.set(...)` locally OR from a
// remote op applied to the doc (`doc.applyOps` → the map observer → this
// signal's `value`). That last path is the whole point of a CRDT-backed signal:
// a remote edit updates the UI with no diff, no re-render of anything else.
//
// ## Scope (v1)
//
// Scalar values only — `String` / `Double` / `Bool` — the JS scalar set a
// `syncedSignal` holds (JS numbers are IEEE doubles, so `number` → `Double`).
// The create-if-missing seed matches web's local-first convention: an ABSENT
// key is seeded with `initial`; a PRESENT key (hydrated / received from a peer)
// wins and `initial` is ignored. Cross-DEVICE transport (wiring `doc.onLocalOps`
// to a native WebSocket and feeding inbound messages to `doc.applyMessage`) is a
// tracked follow-up — this type delivers the local-first reactive half that a
// single device (and a shared in-process doc) needs.

import Foundation
import Observation

/// A value a `PyreonSyncedSignal` can hold — the bridge to the CRDT's
/// `PyreonScalar`. `String` / `Double` / `Bool` conform; JS `number` maps to
/// `Double` so it round-trips a web/Android peer byte-for-byte.
public protocol PyreonScalarConvertible: Equatable {
    init?(pyreonScalar: PyreonScalar)
    var pyreonScalar: PyreonScalar { get }
}

extension String: PyreonScalarConvertible {
    public init?(pyreonScalar: PyreonScalar) {
        guard case .string(let s) = pyreonScalar else { return nil }
        self = s
    }
    public var pyreonScalar: PyreonScalar { .string(self) }
}

extension Double: PyreonScalarConvertible {
    public init?(pyreonScalar: PyreonScalar) {
        switch pyreonScalar {
        case .double(let d): self = d
        case .int(let i): self = Double(i) // a peer that wrote an integer
        default: return nil
        }
    }
    public var pyreonScalar: PyreonScalar { .double(self) }
}

extension Bool: PyreonScalarConvertible {
    public init?(pyreonScalar: PyreonScalar) {
        guard case .bool(let b) = pyreonScalar else { return nil }
        self = b
    }
    public var pyreonScalar: PyreonScalar { .bool(self) }
}

/// The default map name, byte-identical to web's `DEFAULT_MAP` so an iOS signal
/// and a web signal on the same `key` address the same CRDT register.
public let PYREON_SYNCED_DEFAULT_MAP = "pyreon"

/// A `Signal<T>`-shaped view over one scalar entry in a shared `PyreonCrdtDoc`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonSyncedSignal<T: PyreonScalarConvertible> {
    private let doc: PyreonCrdtDoc
    private let map: String
    private let key: String

    /// The current value. Reads track it (`@Observable`); writes go through
    /// `set(_:)` or a remote op applied to the doc.
    public private(set) var value: T

    @ObservationIgnored private var unsubscribe: (() -> Void)?

    public init(doc: PyreonCrdtDoc, map: String = PYREON_SYNCED_DEFAULT_MAP, key: String, initial: T) {
        self.doc = doc
        self.map = map
        self.key = key

        // Local-first create-if-missing: a PRESENT key wins over `initial`.
        if let existing = doc.get(map, key), let v = T(pyreonScalar: existing) {
            self.value = v
        } else {
            self.value = initial
            doc.set(map, key, initial.pyreonScalar)
        }

        // A remote op (or another signal on this doc+key) updates `value` so the
        // view re-renders with no diff.
        self.unsubscribe = doc.observe(map) { [weak self] changed in
            guard let self, changed.contains(self.key) else { return }
            if let s = self.doc.get(self.map, self.key), let v = T(pyreonScalar: s) {
                self.value = v
            }
        }
    }

    /// `signal()` — read the current value. `callAsFunction` lets PMTC emit the
    /// web `title()` spelling unchanged.
    public func callAsFunction() -> T { value }

    /// `signal.set(v)` — write one CRDT op and update the local value.
    public func set(_ v: T) {
        doc.set(map, key, v.pyreonScalar)
        value = v
    }

    /// Detach the CRDT observer. Idempotent. Mirrors the web `dispose()`.
    public func dispose() {
        unsubscribe?()
        unsubscribe = nil
    }

    deinit { unsubscribe?() }
}
