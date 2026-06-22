// PyreonDatabase — the SwiftUI side of Pyreon's cross-platform structured
// local-storage story (Tier 1). Mirrors a `useDatabase` surface and the
// Kotlin `PyreonDatabase` one-for-one.
//
// ## What this delivers vs PyreonStorage / PyreonSecureStorage
//
// `PyreonStorage` is flat key→value app state; `PyreonSecureStorage` is flat
// key→secret. Offline-first apps (todos, finance ledgers, a cached feed)
// need STRUCTURED storage — collections of records you can list, look up by
// id, and query by field. `PyreonDatabase` is that layer:
//
//     db.insert("todos", PyreonRecord(id: "1", fields: ["text": "buy milk", "done": "false"]))
//     db.all("todos")                                   // [PyreonRecord]
//     db.get("todos", id: "1")                          // PyreonRecord?
//     db.find("todos", field: "done", equals: "false")  // open todos
//     db.delete("todos", id: "1")
//
// Records carry string fields; the app serializes structured values (numbers,
// JSON) into/out of them — the same convention `PyreonStorage` uses for its
// Codable bridge, kept simple so the backend contract is tiny.
//
// ## Pluggable backend — in-memory default + injected real persistence
//
// The facade is keyed on a `PyreonDatabaseBackend` (the `StorageBackend`
// blueprint). The DEFAULT is `InMemoryDatabaseBackend` — fully working for
// tests / prototyping but **NOT persistent** (process-lifetime only;
// documented loudly). For production persistence the app injects a
// SQLite-backed (`libsqlite3` is in the Swift toolchain) or Core Data backend;
// on Android a Room / SQLDelight backend. Tests assert the facade contract
// over the in-memory backend synchronously.
//
// ## Relationship to the PMTC compiler emit
//
// A later emit pass detects `const db = useDatabase()` and emits a
// `PyreonDatabase`; CRUD/query calls in the component body become calls on
// this facade.

import Foundation

/// A stored record — an id plus string fields. The app serializes structured
/// values into the fields (number → "42", JSON → a string). Mirrors the
/// Kotlin `PyreonRecord`.
public struct PyreonRecord: Sendable, Equatable {
    public let id: String
    public let fields: [String: String]

    public init(id: String, fields: [String: String] = [:]) {
        self.id = id
        self.fields = fields
    }
}

/// Pluggable persistence backend. The facade defaults to
/// `InMemoryDatabaseBackend`; the app injects a SQLite / Core Data backend
/// for real persistence. Tiny + synchronous (records are small).
public protocol PyreonDatabaseBackend {
    /// Insert or replace a record in `collection` (upsert by `record.id`).
    func insert(_ collection: String, _ record: PyreonRecord)
    /// Fetch a record by id, or `nil` if absent.
    func get(_ collection: String, id: String) -> PyreonRecord?
    /// All records in `collection` (insertion order).
    func all(_ collection: String) -> [PyreonRecord]
    /// Delete a record by id. Returns true on success OR if already absent
    /// (idempotent).
    func delete(_ collection: String, id: String) -> Bool
    /// All records in `collection` whose `field` equals `value`.
    func find(_ collection: String, field: String, equals value: String) -> [PyreonRecord]
}

/// In-memory backend — for tests + prototyping. **NOT persistent**: data
/// lives only for the process lifetime, cleared on relaunch. Production code
/// injects a SQLite / Core Data / Room backend.
public final class InMemoryDatabaseBackend: PyreonDatabaseBackend {
    // collection → ordered ids + id → record (ordered for stable `all`).
    private var order: [String: [String]] = [:]
    private var store: [String: [String: PyreonRecord]] = [:]

    public init() {}

    public func insert(_ collection: String, _ record: PyreonRecord) {
        if store[collection]?[record.id] == nil {
            order[collection, default: []].append(record.id)
        }
        store[collection, default: [:]][record.id] = record
    }

    public func get(_ collection: String, id: String) -> PyreonRecord? {
        store[collection]?[id]
    }

    public func all(_ collection: String) -> [PyreonRecord] {
        guard let ids = order[collection], let recs = store[collection] else { return [] }
        return ids.compactMap { recs[$0] }
    }

    @discardableResult
    public func delete(_ collection: String, id: String) -> Bool {
        store[collection]?[id] = nil
        order[collection]?.removeAll { $0 == id }
        return true // idempotent
    }

    public func find(_ collection: String, field: String, equals value: String) -> [PyreonRecord] {
        all(collection).filter { $0.fields[field] == value }
    }
}

/// Structured local-storage facade — the SwiftUI half of `useDatabase`.
/// Defaults to the in-memory backend; inject a persistent backend in prod.
public final class PyreonDatabase {
    private let backend: PyreonDatabaseBackend

    public init(backend: PyreonDatabaseBackend = InMemoryDatabaseBackend()) {
        self.backend = backend
    }

    /// Insert or replace a record (upsert by id).
    public func insert(_ collection: String, _ record: PyreonRecord) {
        backend.insert(collection, record)
    }

    /// Fetch a record by id, or `nil`.
    public func get(_ collection: String, id: String) -> PyreonRecord? {
        backend.get(collection, id: id)
    }

    /// All records in `collection`.
    public func all(_ collection: String) -> [PyreonRecord] {
        backend.all(collection)
    }

    /// Delete a record by id (idempotent).
    @discardableResult
    public func delete(_ collection: String, id: String) -> Bool {
        backend.delete(collection, id: id)
    }

    /// All records whose `field` equals `value`.
    public func find(_ collection: String, field: String, equals value: String) -> [PyreonRecord] {
        backend.find(collection, field: field, equals: value)
    }

    /// Number of records in `collection`.
    public func count(_ collection: String) -> Int {
        backend.all(collection).count
    }
}
