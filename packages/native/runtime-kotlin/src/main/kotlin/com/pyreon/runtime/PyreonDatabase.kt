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
// ## Pluggable backend — PERSISTENT by default
//
// The facade is keyed on a [PyreonDatabaseBackend]. The DEFAULT is
// [FileDatabaseBackend]: one JSON file per collection under the app's private
// `filesDir`, reloaded on the next launch — so `useDatabase()` persists out of
// the box.
//
// It did NOT, until 2026-07: the default was [InMemoryDatabaseBackend], so an
// app that inserted records and relaunched found them gone, with no warning
// and no error. The whole reason this exists over `PyreonStorage` is
// STRUCTURED data that OUTLIVES the process, so an ephemeral default was not
// a conservative choice — it was silent data loss wearing the word "default".
// [InMemoryDatabaseBackend] remains, explicitly, for tests.
//
// Symmetric with Swift in INTENT — `useDatabase()` persists on both — but
// not in spelling: Foundation hands Swift an Application Support directory
// with no ceremony, so `PyreonDatabase()` can default to the file backend
// there, while Android needs a `Context` to find app-private storage. So
// Kotlin has NO no-arg constructor at all; you name the backend (usually by
// passing the Context). The on-disk JSON bytes are identical either way,
// locked by a cross-language format test.
//
// The JSON codec is hand-written ([PyreonJson]) rather than `org.json` or
// kotlinx-serialization on purpose: this runtime is compiled against MINIMAL
// stubs in CI, so a stubbed parser would make a persistence test assert
// nothing. A dependency-free codec for a fixed `{id, fields}` shape is real in
// every environment — and is itself unit-tested against adversarial strings.
//
// ## Relationship to the PMTC compiler emit
//
// A later emit pass detects `const db = useDatabase()` and emits a
// `PyreonDatabase`; CRUD/query calls become calls on this facade.

package com.pyreon.runtime

import java.io.File

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

/** In-memory backend — **for tests**. NOT persistent: data lives only for the
 * process lifetime. No longer the default (see [FileDatabaseBackend]); pass it
 * explicitly when a test wants isolation from the filesystem. */
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

/** Minimal JSON codec for the `[{ "id": ..., "fields": { ... } }]` shape —
 * the ONLY shape this store writes. Dependency-free so it behaves identically
 * under Android, a plain JVM test, and the stub-only `kotlinc` verification
 * (where `org.json` / kotlinx-serialization are stubs that would silently make
 * a persistence test vacuous).
 *
 * Emits SORTED keys with no whitespace, byte-for-byte matching Swift's
 * `JSONSerialization` with `.sortedKeys`. */
internal object PyreonJson {
    fun encode(records: List<PyreonRecord>): String {
        val sb = StringBuilder("[")
        records.forEachIndexed { i, r ->
            if (i > 0) sb.append(',')
            // "fields" before "id" — alphabetical, matching .sortedKeys.
            sb.append("{\"fields\":{")
            r.fields.keys.sorted().forEachIndexed { j, k ->
                if (j > 0) sb.append(',')
                escape(sb, k); sb.append(':'); escape(sb, r.fields.getValue(k))
            }
            sb.append("},\"id\":"); escape(sb, r.id); sb.append('}')
        }
        return sb.append(']').toString()
    }

    private fun escape(sb: StringBuilder, s: String) {
        sb.append('"')
        for (c in s) {
            when {
                c == '"' -> sb.append("\\\"")
                c == '\\' -> sb.append("\\\\")
                c == '\n' -> sb.append("\\n")
                c == '\r' -> sb.append("\\r")
                c == '\t' -> sb.append("\\t")
                c < ' ' -> sb.append("\\u").append(String.format("%04x", c.code))
                else -> sb.append(c)
            }
        }
        sb.append('"')
    }

    /** Parse back. Returns null on malformed input so the caller can treat a
     * corrupt file as an empty collection rather than crashing the app. */
    fun decode(text: String): List<PyreonRecord>? {
        val p = Parser(text)
        return try {
            p.ws()
            if (!p.eat('[')) return null
            val out = mutableListOf<PyreonRecord>()
            p.ws()
            if (!p.eat(']')) {
                while (true) {
                    out.add(p.record() ?: return null)
                    p.ws()
                    if (p.eat(',')) { p.ws(); continue }
                    if (!p.eat(']')) return null
                    break
                }
            }
            out
        } catch (_: Exception) {
            null
        }
    }

    private class Parser(val s: String) {
        var i = 0
        fun ws() { while (i < s.length && s[i].isWhitespace()) i++ }
        fun eat(c: Char): Boolean { if (i < s.length && s[i] == c) { i++; return true }; return false }

        fun record(): PyreonRecord? {
            ws()
            if (!eat('{')) return null
            var id: String? = null
            var fields: Map<String, String> = emptyMap()
            ws()
            if (!eat('}')) {
                while (true) {
                    ws()
                    val key = str() ?: return null
                    ws(); if (!eat(':')) return null; ws()
                    when (key) {
                        "id" -> id = str() ?: return null
                        "fields" -> fields = obj() ?: return null
                        else -> return null // unknown key: treat as corrupt
                    }
                    ws()
                    if (eat(',')) continue
                    if (!eat('}')) return null
                    break
                }
            }
            return PyreonRecord(id ?: return null, fields)
        }

        fun obj(): Map<String, String>? {
            if (!eat('{')) return null
            val out = LinkedHashMap<String, String>()
            ws()
            if (eat('}')) return out
            while (true) {
                ws()
                val k = str() ?: return null
                ws(); if (!eat(':')) return null; ws()
                out[k] = str() ?: return null
                ws()
                if (eat(',')) continue
                if (!eat('}')) return null
                break
            }
            return out
        }

        fun str(): String? {
            if (!eat('"')) return null
            val sb = StringBuilder()
            while (i < s.length) {
                val c = s[i++]
                when {
                    c == '"' -> return sb.toString()
                    c == '\\' -> {
                        if (i >= s.length) return null
                        when (val e = s[i++]) {
                            '"' -> sb.append('"')
                            '\\' -> sb.append('\\')
                            '/' -> sb.append('/')
                            'n' -> sb.append('\n')
                            'r' -> sb.append('\r')
                            't' -> sb.append('\t')
                            'b' -> sb.append('\b')
                            'f' -> sb.append('\u000C')
                            'u' -> {
                                if (i + 4 > s.length) return null
                                sb.append(s.substring(i, i + 4).toInt(16).toChar()); i += 4
                            }
                            else -> sb.append(e)
                        }
                    }
                    else -> sb.append(c)
                }
            }
            return null
        }
    }
}

/** File-backed backend — the DEFAULT, and what makes `useDatabase()` actually
 * persist. One JSON file per collection under [directory] (the app's private
 * `filesDir/PyreonDatabase` by default), reloaded lazily on first touch.
 *
 * Failure is non-fatal by design: a corrupt/unreadable file is treated as an
 * empty collection and a failed write is dropped after [onError]. A database
 * that CRASHES the app when the disk is full is worse than one that degrades
 * to the behaviour of the previous default. */
public class FileDatabaseBackend(
    private val directory: File,
    private val onError: ((String, Throwable) -> Unit)? = null,
) : PyreonDatabaseBackend {
    private val loaded = mutableSetOf<String>()
    private val order = mutableMapOf<String, MutableList<String>>()
    private val store = mutableMapOf<String, MutableMap<String, PyreonRecord>>()

    init {
        try {
            directory.mkdirs()
        } catch (t: Throwable) {
            onError?.invoke("createDirectory", t)
        }
    }

    /** Where this backend stores its collection files. */
    public val directoryFile: File get() = directory

    // A collection name is app data, so it can contain "/" or ".." and must
    // never be pasted into a path. Percent-encoding everything outside a
    // conservative allowlist makes traversal structurally impossible while
    // keeping ordinary names ("todos") readable on disk. Mirrors Swift.
    private fun fileFor(collection: String): File {
        val sb = StringBuilder()
        for (c in collection) {
            if (c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9' || c == '-' || c == '_') sb.append(c)
            else sb.append('%').append(String.format("%02X", c.code and 0xFF))
        }
        if (sb.isEmpty()) sb.append('_')
        return File(directory, "$sb.json")
    }

    private fun load(collection: String) {
        if (!loaded.add(collection)) return
        val f = fileFor(collection)
        if (!f.exists()) return
        try {
            val records = PyreonJson.decode(f.readText())
            if (records == null) {
                onError?.invoke("load:$collection", IllegalStateException("corrupt JSON"))
                return
            }
            val ids = mutableListOf<String>()
            val recs = mutableMapOf<String, PyreonRecord>()
            for (r in records) {
                if (!recs.containsKey(r.id)) ids.add(r.id)
                recs[r.id] = r
            }
            order[collection] = ids
            store[collection] = recs
        } catch (t: Throwable) {
            onError?.invoke("load:$collection", t)
        }
    }

    private fun flush(collection: String) {
        val ids = order[collection] ?: mutableListOf()
        val recs = store[collection] ?: mutableMapOf()
        try {
            // Write-then-rename: a crash mid-write leaves the PREVIOUS file
            // intact instead of a truncated one. Swift gets this from
            // `Data.write(options: .atomic)`.
            val target = fileFor(collection)
            val tmp = File(directory, target.name + ".tmp")
            tmp.writeText(PyreonJson.encode(ids.mapNotNull { recs[it] }))
            if (!tmp.renameTo(target)) {
                target.delete()
                if (!tmp.renameTo(target)) throw IllegalStateException("rename failed")
            }
        } catch (t: Throwable) {
            onError?.invoke("flush:$collection", t)
        }
    }

    override fun insert(collection: String, record: PyreonRecord) {
        load(collection)
        val recs = store.getOrPut(collection) { mutableMapOf() }
        if (!recs.containsKey(record.id)) order.getOrPut(collection) { mutableListOf() }.add(record.id)
        recs[record.id] = record
        flush(collection)
    }

    override fun get(collection: String, id: String): PyreonRecord? {
        load(collection)
        return store[collection]?.get(id)
    }

    override fun all(collection: String): List<PyreonRecord> {
        load(collection)
        val ids = order[collection] ?: return emptyList()
        val recs = store[collection] ?: return emptyList()
        return ids.mapNotNull { recs[it] }
    }

    override fun delete(collection: String, id: String): Boolean {
        load(collection)
        store[collection]?.remove(id)
        order[collection]?.remove(id)
        flush(collection)
        return true // idempotent
    }

    override fun find(collection: String, field: String, value: String): List<PyreonRecord> =
        all(collection).filter { it.fields[field] == value }
}

/** Structured local-storage facade — the Compose half of `useDatabase`.
 *
 * The backend is REQUIRED — there is deliberately no `PyreonDatabase()`. It
 * used to default to [InMemoryDatabaseBackend], which meant the shortest thing
 * you could write was also the one that silently lost every record on
 * relaunch. Making the choice explicit costs one argument and removes a whole
 * class of "my data disappeared" bug:
 *
 *   - `PyreonDatabase(context)`               persistent (see PyreonDatabaseAndroid.kt)
 *   - `PyreonDatabase(InMemoryDatabaseBackend())`  a test wants no filesystem
 *   - `PyreonDatabase(myRoomBackend)`         the app outgrew the file store
 *
 * The compiler emit uses the first form, so `useDatabase()` persists. */
public class PyreonDatabase(private val backend: PyreonDatabaseBackend) {

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
