// Smoke tests for PyreonDatabase — the structured local store. Dependency-
// free `check(...)` harness; runs via `verify-kotlin.ts --service=PyreonDatabase`.
//
// Scope: the facade + in-memory backend contract (insert/get/all/delete/find/
// count, upsert, ordering, idempotent delete, collection isolation). The real
// Room backend is the app's / Android-CI's responsibility.

package com.pyreon.runtime

import java.io.File

fun testDbInsertGet() {
    val db = PyreonDatabase(InMemoryDatabaseBackend())
    check(db.get("todos", "1") == null) { "absent record reads null" }
    val r = PyreonRecord("1", mapOf("text" to "buy milk", "done" to "false"))
    db.insert("todos", r)
    check(db.get("todos", "1") == r) { "inserted record reads back" }
    check(db.get("todos", "1")?.fields?.get("text") == "buy milk") { "fields carried" }
}

fun testDbUpsert() {
    val db = PyreonDatabase(InMemoryDatabaseBackend())
    db.insert("todos", PyreonRecord("1", mapOf("done" to "false")))
    db.insert("todos", PyreonRecord("1", mapOf("done" to "true")))
    check(db.get("todos", "1")?.fields?.get("done") == "true") { "insert upserts by id" }
    check(db.count("todos") == 1) { "upsert doesn't duplicate" }
}

fun testDbAllPreservesInsertionOrder() {
    val db = PyreonDatabase(InMemoryDatabaseBackend())
    db.insert("todos", PyreonRecord("a"))
    db.insert("todos", PyreonRecord("b"))
    db.insert("todos", PyreonRecord("c"))
    check(db.all("todos").map { it.id } == listOf("a", "b", "c")) { "all() preserves insertion order" }
    // upsert keeps original position
    db.insert("todos", PyreonRecord("a", mapOf("x" to "1")))
    check(db.all("todos").map { it.id } == listOf("a", "b", "c")) { "upsert keeps position" }
}

fun testDbDelete() {
    val db = PyreonDatabase(InMemoryDatabaseBackend())
    db.insert("todos", PyreonRecord("1"))
    check(db.count("todos") == 1) { "one record" }
    check(db.delete("todos", "1")) { "delete returns true" }
    check(db.get("todos", "1") == null) { "deleted record gone" }
    check(db.count("todos") == 0) { "count back to zero" }
}

fun testDbDeleteAbsentIsIdempotent() {
    val db = PyreonDatabase(InMemoryDatabaseBackend())
    check(db.delete("todos", "never")) { "delete of absent id is idempotent (true)" }
}

fun testDbFind() {
    val db = PyreonDatabase(InMemoryDatabaseBackend())
    db.insert("todos", PyreonRecord("1", mapOf("done" to "false")))
    db.insert("todos", PyreonRecord("2", mapOf("done" to "true")))
    db.insert("todos", PyreonRecord("3", mapOf("done" to "false")))
    val open = db.find("todos", "done", "false")
    check(open.map { it.id } == listOf("1", "3")) { "find returns matching records in order" }
    check(db.find("todos", "done", "true").size == 1) { "find on other value" }
    check(db.find("todos", "missing", "x").isEmpty()) { "find on missing field → empty" }
}

fun testDbCollectionsAreIsolated() {
    val db = PyreonDatabase(InMemoryDatabaseBackend())
    db.insert("todos", PyreonRecord("1"))
    db.insert("notes", PyreonRecord("1"))
    check(db.count("todos") == 1) { "todos has 1" }
    check(db.count("notes") == 1) { "notes has 1 (same id, different collection)" }
    db.delete("todos", "1")
    check(db.get("todos", "1") == null) { "todos record deleted" }
    check(db.get("notes", "1") != null) { "notes record isolated from todos delete" }
}

/** A custom backend is honored (call-counting spy) — pins the pluggable
 * contract so an app injecting Room gets exactly these calls. */
fun testDbFacadeRoutesThroughBackend() {
    var inserts = 0
    var finds = 0
    val spy = object : PyreonDatabaseBackend {
        private val inner = InMemoryDatabaseBackend()
        override fun insert(collection: String, record: PyreonRecord) {
            inserts++; inner.insert(collection, record)
        }
        override fun get(collection: String, id: String) = inner.get(collection, id)
        override fun all(collection: String) = inner.all(collection)
        override fun delete(collection: String, id: String) = inner.delete(collection, id)
        override fun find(collection: String, field: String, value: String): List<PyreonRecord> {
            finds++; return inner.find(collection, field, value)
        }
    }
    val db = PyreonDatabase(spy)
    db.insert("c", PyreonRecord("1", mapOf("k" to "v")))
    db.find("c", "k", "v")
    check(inserts == 1) { "insert routed through backend" }
    check(finds == 1) { "find routed through backend" }
}


// ---------------------------------------------------------------------------
// FileDatabaseBackend — the DEFAULT the compiler emit uses, and the whole
// reason `useDatabase` exists over `PyreonStorage`.
//
// The bug these lock: the facade used to default to the in-memory backend, so
// an app that inserted records and relaunched found them gone — silently, with
// no warning and no error.
//
// A SECOND backend over the SAME directory is exactly what a relaunch is: no
// in-process cache carries over, so anything the second instance reads came
// off the disk. These run for real (plain `java.io.File`, no stubs), which is
// why the Android Context factory lives in its own file.

private fun tempDbDir(label: String): File {
    val dir = File(System.getProperty("java.io.tmpdir"), "pyreon-db-$label-${System.nanoTime()}")
    dir.mkdirs()
    return dir
}

fun testFileBackendPersistsAcrossInstances() {
    val dir = tempDbDir("persist")
    try {
        PyreonDatabase(FileDatabaseBackend(dir)).insert("txns", PyreonRecord("t1", mapOf("amount" to "4200")))
        val relaunched = PyreonDatabase(FileDatabaseBackend(dir))
        check(relaunched.get("txns", "t1")?.fields?.get("amount") == "4200") {
            "a fresh backend over the same dir must read what the first wrote"
        }
    } finally {
        dir.deleteRecursively()
    }
}

fun testFileBackendPersistsOrderAndUpserts() {
    val dir = tempDbDir("order")
    try {
        val a = FileDatabaseBackend(dir)
        a.insert("todos", PyreonRecord("1", mapOf("done" to "false")))
        a.insert("todos", PyreonRecord("2", mapOf("done" to "true")))
        a.insert("todos", PyreonRecord("3", mapOf("done" to "false")))
        a.insert("todos", PyreonRecord("1", mapOf("done" to "true"))) // upsert

        val b = FileDatabaseBackend(dir)
        check(b.all("todos").map { it.id } == listOf("1", "2", "3")) { "insertion order survives the round trip" }
        check(b.get("todos", "1")?.fields?.get("done") == "true") { "upsert persisted" }
        check(b.find("todos", "done", "true").map { it.id } == listOf("1", "2")) { "find over reloaded data" }
    } finally {
        dir.deleteRecursively()
    }
}

fun testFileBackendPersistsDeletes() {
    // A delete that only clears the cache would "work" in-process and
    // resurrect the record on relaunch — the nastier half of the bug.
    val dir = tempDbDir("delete")
    try {
        val a = FileDatabaseBackend(dir)
        a.insert("todos", PyreonRecord("1"))
        a.insert("todos", PyreonRecord("2"))
        a.delete("todos", "1")

        val b = FileDatabaseBackend(dir)
        check(b.get("todos", "1") == null) { "deleted record must not come back" }
        check(b.all("todos").map { it.id } == listOf("2")) { "survivor remains" }
    } finally {
        dir.deleteRecursively()
    }
}

fun testFileBackendRejectsPathTraversal() {
    // A collection name is app data. "../escape" must land inside the
    // backend's own directory, not walk out of it.
    val dir = tempDbDir("traversal")
    try {
        FileDatabaseBackend(dir).insert("../escape", PyreonRecord("1"))
        val outside = File(dir.parentFile, "escape.json")
        check(!outside.exists()) { "collection name must not escape the store directory" }
        val written = dir.listFiles()?.map { it.name } ?: emptyList()
        check(written.size == 1) { "exactly one file written, got $written" }
        check(FileDatabaseBackend(dir).all("../escape").map { it.id } == listOf("1")) {
            "still readable under its escaped name"
        }
    } finally {
        dir.deleteRecursively()
    }
}

fun testFileBackendSurvivesCorruptFile() {
    // Degrade to an empty collection; never crash the app.
    val dir = tempDbDir("corrupt")
    try {
        File(dir, "todos.json").writeText("{ not json")
        val reported = mutableListOf<String>()
        val a = FileDatabaseBackend(dir) { op, _ -> reported.add(op) }
        check(a.all("todos").isEmpty()) { "corrupt file reads as empty, not a throw" }
        check(reported == listOf("load:todos")) { "the failure is reported, not swallowed: $reported" }
        a.insert("todos", PyreonRecord("1"))
        check(FileDatabaseBackend(dir).all("todos").map { it.id } == listOf("1")) { "recovers after a write" }
    } finally {
        dir.deleteRecursively()
    }
}

fun testOnDiskFormatMatchesSwiftBytes() {
    // The Swift backend writes these EXACT bytes for this exact input
    // (JSONSerialization + .sortedKeys); PyreonRuntimeTests asserts the same
    // string. Two independent encoders drift the moment nothing compares them.
    val dir = tempDbDir("format")
    try {
        FileDatabaseBackend(dir).insert(
            "todos",
            PyreonRecord("1", mapOf("done" to "false", "text" to "buy \"milk\"")),
        )
        val raw = File(dir, "todos.json").readText()
        val expected = """[{"fields":{"done":"false","text":"buy \"milk\""},"id":"1"}]"""
        check(raw == expected) { "on-disk format drifted from Swift:\n  got      $raw\n  expected $expected" }
    } finally {
        dir.deleteRecursively()
    }
}

fun testJsonCodecRoundTripsAdversarialStrings() {
    // The codec is hand-written (a stubbed JSON lib would make the persistence
    // tests vacuous in CI), so it earns its own escaping test.
    val nasty = mapOf(
        "quote" to "he said \"hi\"",
        "backslash" to """a\b\\c""",
        "newline" to "line1\nline2\r\n",
        "tab" to "a\tb",
        "unicode" to "héllo → 世界 🎉",
        "control" to "bell: null-ish:",
        "empty" to "",
        "jsonish" to """{"nested":[1,2]}""",
    )
    val records = listOf(PyreonRecord("id\"with\\quotes", nasty), PyreonRecord("plain"))
    val decoded = PyreonJson.decode(PyreonJson.encode(records))
    check(decoded == records) { "round trip lost data:\n  got $decoded\n  want $records" }
    check(PyreonJson.decode("") == null) { "empty input is malformed" }
    check(PyreonJson.decode("[{\"id\":") == null) { "truncated input is malformed" }
    check(PyreonJson.decode("[]") == emptyList<PyreonRecord>()) { "empty array is valid and empty" }
}

fun main() {
    testDbInsertGet()
    testDbUpsert()
    testDbAllPreservesInsertionOrder()
    testDbDelete()
    testDbDeleteAbsentIsIdempotent()
    testDbFind()
    testDbCollectionsAreIsolated()
    testDbFacadeRoutesThroughBackend()
    testFileBackendPersistsAcrossInstances()
    testFileBackendPersistsOrderAndUpserts()
    testFileBackendPersistsDeletes()
    testFileBackendRejectsPathTraversal()
    testFileBackendSurvivesCorruptFile()
    testOnDiskFormatMatchesSwiftBytes()
    testJsonCodecRoundTripsAdversarialStrings()
    println("[PyreonDatabaseTest] all smoke tests passed")
}
