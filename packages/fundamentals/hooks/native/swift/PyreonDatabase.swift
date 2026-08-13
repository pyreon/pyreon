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
// ## Pluggable backend — PERSISTENT by default
//
// The facade is keyed on a `PyreonDatabaseBackend` (the `StorageBackend`
// blueprint). The DEFAULT is `FileDatabaseBackend`, which writes each
// collection to a JSON file under Application Support and reloads it on the
// next launch — so `useDatabase()` persists out of the box.
//
// It did NOT, until 2026-07: the default was `InMemoryDatabaseBackend`, so an
// app that inserted records and relaunched found them gone, with no warning
// and no error. The API's whole reason to exist over `PyreonStorage` is
// structured data that OUTLIVES the process, so an ephemeral default was not
// a conservative choice — it was a silent data-loss bug wearing the word
// "default". `InMemoryDatabaseBackend` remains, explicitly, for tests.
//
// `FileDatabaseBackend` is deliberately Foundation-only (no SQLite module
// map, no dependency): a record is an id plus string fields, collections are
// small, and every write is atomic. Apps with large or query-heavy datasets
// inject a SQLite / Core Data backend through the same initialiser — the
// point of the default is that "it works" is the starting state, not a
// milestone the app has to reach on its own.
//
// Tests assert the facade contract over the in-memory backend synchronously,
// and the file backend's persistence by constructing a SECOND backend over
// the same directory (a fresh instance reading what the first wrote is
// exactly what a relaunch does).
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

/// In-memory backend — **for tests**. NOT persistent: data lives only for the
/// process lifetime, cleared on relaunch. This is no longer the default (see
/// `FileDatabaseBackend`); pass it explicitly when a test wants isolation
/// from the filesystem.
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

/// File-backed backend — the DEFAULT, and what makes `useDatabase()` actually
/// persist. One JSON file per collection under `Application Support/
/// PyreonDatabase/`, written atomically, reloaded lazily on first touch.
///
/// Foundation-only on purpose. SQLite would mean a module map that differs
/// between Apple platforms (`import SQLite3`) and Linux (a system-library
/// target) — the exact toolchain split that has broken this runtime's CI
/// before — for a store whose records are an id plus string fields. Apps that
/// outgrow it inject their own backend; nothing about the facade changes.
///
/// Failure is non-fatal by design: an unreadable/corrupt file is treated as an
/// empty collection and a failed write is dropped after `onError`. A database
/// that CRASHES the app when the disk is full is worse than one that degrades
/// to the behaviour of the previous default.
public final class FileDatabaseBackend: PyreonDatabaseBackend {
    private let directory: URL
    private let fileManager: FileManager
    private let onError: ((String, Error) -> Void)?

    // Lazily-loaded per-collection cache. Reads never hit the disk twice, and
    // `all()` keeps insertion order because the cache IS the order.
    private var loaded: Set<String> = []
    private var order: [String: [String]] = [:]
    private var store: [String: [String: PyreonRecord]] = [:]

    /// - Parameters:
    ///   - directory: where collection files live. Defaults to
    ///     `Application Support/PyreonDatabase` — the platform-correct home
    ///     for app-managed, non-user-facing data (it is excluded from the
    ///     user's document browser and, unlike `caches`, the OS does not purge
    ///     it under storage pressure). Falls back to a temporary directory
    ///     when Application Support is unavailable, so construction never
    ///     fails; that fallback is process-scoped in practice, which is why
    ///     `directoryURL` is exposed for apps that want to assert on it.
    ///   - onError: notified on a read/write failure. Nil = silent.
    public init(
        directory: URL? = nil,
        fileManager: FileManager = .default,
        onError: ((String, Error) -> Void)? = nil
    ) {
        self.fileManager = fileManager
        self.onError = onError
        let base = directory ?? Self.defaultDirectory(fileManager)
        self.directory = base
        do {
            try fileManager.createDirectory(at: base, withIntermediateDirectories: true)
        } catch {
            onError?("createDirectory", error)
        }
    }

    /// Where this backend stores its collection files.
    public var directoryURL: URL { directory }

    /// The directory a no-argument `FileDatabaseBackend()` uses. Public so a
    /// test can assert that the DEFAULT construction persists — not merely
    /// that an explicitly-file-backed one does, which is a different (and much
    /// weaker) claim.
    public static func defaultDirectory(_ fm: FileManager = .default) -> URL {
        let support = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        let base = support ?? fm.temporaryDirectory
        return base.appendingPathComponent("PyreonDatabase", isDirectory: true)
    }

    // A collection name is app-supplied, so it can contain "/" or ".." and
    // must never be pasted into a path. Percent-encoding every byte outside a
    // conservative allowlist makes traversal structurally impossible while
    // keeping ordinary names ("todos") readable on disk.
    private func fileURL(_ collection: String) -> URL {
        var safe = ""
        for scalar in collection.unicodeScalars {
            let c = Character(scalar)
            if c.isLetter && c.isASCII || c.isNumber && c.isASCII || c == "-" || c == "_" {
                safe.append(c)
            } else {
                safe += String(format: "%%%02X", scalar.value & 0xFF)
            }
        }
        if safe.isEmpty { safe = "_" }
        return directory.appendingPathComponent(safe + ".json", isDirectory: false)
    }

    private func load(_ collection: String) {
        if loaded.contains(collection) { return }
        loaded.insert(collection)
        let url = fileURL(collection)
        guard fileManager.fileExists(atPath: url.path) else { return }
        do {
            let data = try Data(contentsOf: url)
            let parsed = try JSONSerialization.jsonObject(with: data)
            guard let rows = parsed as? [[String: Any]] else { return }
            var ids: [String] = []
            var recs: [String: PyreonRecord] = [:]
            for row in rows {
                guard let id = row["id"] as? String else { continue }
                let fields = (row["fields"] as? [String: String]) ?? [:]
                if recs[id] == nil { ids.append(id) }
                recs[id] = PyreonRecord(id: id, fields: fields)
            }
            order[collection] = ids
            store[collection] = recs
        } catch {
            // Corrupt or unreadable => an empty collection, not a crash.
            onError?("load:\(collection)", error)
        }
    }

    private func flush(_ collection: String) {
        let ids = order[collection] ?? []
        let recs = store[collection] ?? [:]
        let rows: [[String: Any]] = ids.compactMap { id in
            guard let r = recs[id] else { return nil }
            return ["id": r.id, "fields": r.fields]
        }
        do {
            // `.sortedKeys` makes the bytes deterministic, which is what lets
            // the cross-language format test assert on them.
            let data = try JSONSerialization.data(withJSONObject: rows, options: [.sortedKeys])
            try data.write(to: fileURL(collection), options: .atomic)
        } catch {
            onError?("flush:\(collection)", error)
        }
    }

    public func insert(_ collection: String, _ record: PyreonRecord) {
        load(collection)
        if store[collection]?[record.id] == nil {
            order[collection, default: []].append(record.id)
        }
        store[collection, default: [:]][record.id] = record
        flush(collection)
    }

    public func get(_ collection: String, id: String) -> PyreonRecord? {
        load(collection)
        return store[collection]?[id]
    }

    public func all(_ collection: String) -> [PyreonRecord] {
        load(collection)
        guard let ids = order[collection], let recs = store[collection] else { return [] }
        return ids.compactMap { recs[$0] }
    }

    @discardableResult
    public func delete(_ collection: String, id: String) -> Bool {
        load(collection)
        store[collection]?[id] = nil
        order[collection]?.removeAll { $0 == id }
        flush(collection)
        return true // idempotent
    }

    public func find(_ collection: String, field: String, equals value: String) -> [PyreonRecord] {
        all(collection).filter { $0.fields[field] == value }
    }
}

/// Structured local-storage facade — the SwiftUI half of `useDatabase`.
/// PERSISTS by default (`FileDatabaseBackend`); pass `InMemoryDatabaseBackend()`
/// for tests, or your own backend for SQLite / Core Data.
public final class PyreonDatabase {
    private let backend: PyreonDatabaseBackend

    public init(backend: PyreonDatabaseBackend = FileDatabaseBackend()) {
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
