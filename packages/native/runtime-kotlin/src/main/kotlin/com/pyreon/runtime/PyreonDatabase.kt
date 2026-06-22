// PyreonDatabase — the Compose side of Pyreon's cross-platform structured
// local-storage story (Tier 1). Mirrors a `useDatabase` surface and the Swift
// `PyreonDatabase` one-for-one.
//
// ## What this delivers vs PyreonStorage / PyreonSecureStorage
//
// Flat key→value (`PyreonStorage`) / key→secret (`PyreonSecureStorage`) isn't
// enough for offline-first apps (todos, finance ledgers, a cached feed) —
// they need STRUCTURED storage: collections of records you can list, look up
// by id, and query by field. `PyreonDatabase` is that layer:
//
//     db.insert("todos", PyreonRecord("1", mapOf("text" to "buy milk", "done" to "false")))
//     db.all("todos")                                  // List<PyreonRecord>
//     db.get("todos", "1")                             // PyreonRecord?
//     db.find("todos", "done", "false")                // open todos
//     db.delete("todos", "1")
//
// Records carry string fields; the app serializes structured values into/out
// of them (the same convention PyreonStorage uses).
//
// ## Pluggable backend — in-memory default + injected real persistence
//
// The facade is keyed on a [PyreonDatabaseBackend]. The DEFAULT is
// [InMemoryDatabaseBackend] — fully working for tests / prototyping but **NOT
// persistent** (process-lifetime only). For production the app injects a Room
// / SQLDelight backend; on iOS a SQLite / Core Data backend. Same shape as
// Swift (symmetric — both default to in-memory, both accept an injected real
// backend). The real Room backend is an Android-CI follow-up.
//
// ## Relationship to the PMTC compiler emit
//
// A later emit pass detects `const db = useDatabase()` and emits a
// `PyreonDatabase`; CRUD/query calls become calls on this facade.

package com.pyreon.runtime

/** A stored record — an id plus string fields. Mirrors the Swift
 * `PyreonRecord`. */
public data class PyreonRecord(
    val id: String,
    val fields: Map<String, String> = emptyMap(),
)

/** Pluggable persistence backend. The facade defaults to
 * [InMemoryDatabaseBackend]; the app injects a Room / SQLDelight backend for
 * real persistence. */
public interface PyreonDatabaseBackend {
    /** Insert or replace a record in [collection] (upsert by `record.id`). */
    public fun insert(collection: String, record: PyreonRecord)

    /** Fetch a record by id, or null if absent. */
    public fun get(collection: String, id: String): PyreonRecord?

    /** All records in [collection] (insertion order). */
    public fun all(collection: String): List<PyreonRecord>

    /** Delete a record by id. Returns true on success OR if already absent
     * (idempotent). */
    public fun delete(collection: String, id: String): Boolean

    /** All records in [collection] whose [field] equals [value]. */
    public fun find(collection: String, field: String, value: String): List<PyreonRecord>
}

/** In-memory backend — for tests + prototyping. **NOT persistent**: data
 * lives only for the process lifetime. Production injects a Room / SQLDelight
 * backend. */
public class InMemoryDatabaseBackend : PyreonDatabaseBackend {
    private val order = mutableMapOf<String, MutableList<String>>()
    private val store = mutableMapOf<String, MutableMap<String, PyreonRecord>>()

    override fun insert(collection: String, record: PyreonRecord) {
        val recs = store.getOrPut(collection) { mutableMapOf() }
        if (!recs.containsKey(record.id)) {
            order.getOrPut(collection) { mutableListOf() }.add(record.id)
        }
        recs[record.id] = record
    }

    override fun get(collection: String, id: String): PyreonRecord? = store[collection]?.get(id)

    override fun all(collection: String): List<PyreonRecord> {
        val ids = order[collection] ?: return emptyList()
        val recs = store[collection] ?: return emptyList()
        return ids.mapNotNull { recs[it] }
    }

    override fun delete(collection: String, id: String): Boolean {
        store[collection]?.remove(id)
        order[collection]?.remove(id)
        return true // idempotent
    }

    override fun find(collection: String, field: String, value: String): List<PyreonRecord> =
        all(collection).filter { it.fields[field] == value }
}

/** Structured local-storage facade — the Compose half of `useDatabase`.
 * Defaults to the in-memory backend; inject a persistent backend in prod. */
public class PyreonDatabase(private val backend: PyreonDatabaseBackend = InMemoryDatabaseBackend()) {
    /** Insert or replace a record (upsert by id). */
    public fun insert(collection: String, record: PyreonRecord): Unit = backend.insert(collection, record)

    /** Fetch a record by id, or null. */
    public fun get(collection: String, id: String): PyreonRecord? = backend.get(collection, id)

    /** All records in [collection]. */
    public fun all(collection: String): List<PyreonRecord> = backend.all(collection)

    /** Delete a record by id (idempotent). */
    public fun delete(collection: String, id: String): Boolean = backend.delete(collection, id)

    /** All records whose [field] equals [value]. */
    public fun find(collection: String, field: String, value: String): List<PyreonRecord> =
        backend.find(collection, field, value)

    /** Number of records in [collection]. */
    public fun count(collection: String): Int = backend.all(collection).size
}
