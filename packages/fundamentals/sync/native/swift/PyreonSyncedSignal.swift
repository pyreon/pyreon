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
//
// ## Create-if-missing seeds a SEPARATE defaults map (web #2519)
//
// The create-if-missing seed writes `initial` into a companion `"<map>:defaults"`
// map, NEVER the real data map, and reads resolve real → defaults → `initial`.
// Because reads PREFER the real map, a default can never outrank real data no
// matter how a clientId (actor) tie-break falls — closing the "two fresh devices
// open, one types, the other's default wipes it" clobber. Byte-for-byte the web
// `synced-signal.ts` design: same `:defaults` suffix, same precedence.
//
// Residual (inherent, same as web): two FRESH peers seeding an EMPTY room with
// DIFFERENT `initial` values for the same key still tie-break — but the tie is now
// among DEFAULTS only, so peers CONVERGE on one default (harmless), they do not
// diverge, and a real value can never be lost to it. Gate app defaults behind
// `transport.synced` if which default wins matters.

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

/// Suffix for the companion map that holds create-if-missing DEFAULTS —
/// byte-identical to web's `DEFAULTS_SUFFIX`. Kept OUT of the data map on purpose:
/// a default written alongside real data can win an actor tie-break and destroy it
/// (#2519). Reads prefer the data map, so a default can never outrank a real value.
public let PYREON_SYNCED_DEFAULTS_SUFFIX = ":defaults"

/// A `Signal<T>`-shaped view over one scalar entry in a shared `PyreonCrdtDoc`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonSyncedSignal<T: PyreonScalarConvertible> {
    private let doc: PyreonCrdtDoc
    private let map: String
    /// The companion `"<map>:defaults"` map that holds create-if-missing seeds.
    private let defaultsMap: String
    private let key: String
    private let initial: T

    /// The current value. Reads track it (`@Observable`); writes go through
    /// `set(_:)` or a remote op applied to the doc.
    public private(set) var value: T

    @ObservationIgnored private var unsubscribe: (() -> Void)?
    @ObservationIgnored private var unsubscribeDefaults: (() -> Void)?

    public init(doc: PyreonCrdtDoc, map: String = PYREON_SYNCED_DEFAULT_MAP, key: String, initial: T) {
        self.doc = doc
        self.map = map
        self.defaultsMap = "\(map)\(PYREON_SYNCED_DEFAULTS_SUFFIX)"
        self.key = key
        self.initial = initial

        // Resolve precedence: REAL map wins → shared DEFAULT → local `initial`.
        // Inlined because an instance method can't be called until every stored
        // property has been initialized (Swift definite-initialization).
        if let s = doc.get(map, key), let v = T(pyreonScalar: s) {
            self.value = v
        } else if let s = doc.get(self.defaultsMap, key), let v = T(pyreonScalar: s) {
            self.value = v
        } else {
            self.value = initial
        }

        // Observe the REAL map: any real write (local `set` or a remote op) updates
        // `value` so the view re-renders with no diff.
        self.unsubscribe = doc.observe(map) { [weak self] changed in
            guard let self, changed.contains(self.key) else { return }
            self.value = self.resolve()
        }

        // Observe the DEFAULTS map: a peer's default reaches a peer that has none.
        // A real value already present WINS (real-map precedence), so skip when the
        // real map already holds the key — a late-arriving default never overwrites
        // real data.
        self.unsubscribeDefaults = doc.observe(self.defaultsMap) { [weak self] changed in
            guard let self, changed.contains(self.key), !self.doc.has(self.map, self.key) else { return }
            self.value = self.resolve()
        }

        // Create-if-missing SEED — into the DEFAULTS map, never the real map (#2519),
        // and only when the key is absent from BOTH. A real value (persisted / from a
        // peer) or a default another peer already published leaves the seed skipped.
        if !doc.has(map, key) && !doc.has(self.defaultsMap, key) {
            doc.set(self.defaultsMap, key, initial.pyreonScalar)
        }
    }

    /// Real value if present, else a shared default, else the local `initial`.
    private func resolve() -> T {
        if let s = doc.get(map, key), let v = T(pyreonScalar: s) { return v }
        if let s = doc.get(defaultsMap, key), let v = T(pyreonScalar: s) { return v }
        return initial
    }

    /// `signal()` — read the current value. `callAsFunction` lets PMTC emit the
    /// web `title()` spelling unchanged.
    public func callAsFunction() -> T { value }

    /// `signal.set(v)` — a user write is REAL data, so it goes to the REAL map (never
    /// the defaults map). Writes one CRDT op; the real-map observer echoes it back.
    public func set(_ v: T) {
        doc.set(map, key, v.pyreonScalar)
        value = v
    }

    /// Detach both CRDT observers. Idempotent. Mirrors the web `dispose()`.
    public func dispose() {
        unsubscribe?()
        unsubscribe = nil
        unsubscribeDefaults?()
        unsubscribeDefaults = nil
    }

    deinit {
        unsubscribe?()
        unsubscribeDefaults?()
    }
}
