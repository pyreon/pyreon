// Smoke tests for PyreonDatabase — the structured local store. Dependency-
// free `check(...)` harness; runs via `verify-kotlin.ts --service=PyreonDatabase`.
//
// Scope: the facade + in-memory backend contract (insert/get/all/delete/find/
// count, upsert, ordering, idempotent delete, collection isolation). The real
// Room backend is the app's / Android-CI's responsibility.

package com.pyreon.runtime

fun testDbInsertGet() {
    val db = PyreonDatabase()
    check(db.get("todos", "1") == null) { "absent record reads null" }
    val r = PyreonRecord("1", mapOf("text" to "buy milk", "done" to "false"))
    db.insert("todos", r)
    check(db.get("todos", "1") == r) { "inserted record reads back" }
    check(db.get("todos", "1")?.fields?.get("text") == "buy milk") { "fields carried" }
}

fun testDbUpsert() {
    val db = PyreonDatabase()
    db.insert("todos", PyreonRecord("1", mapOf("done" to "false")))
    db.insert("todos", PyreonRecord("1", mapOf("done" to "true")))
    check(db.get("todos", "1")?.fields?.get("done") == "true") { "insert upserts by id" }
    check(db.count("todos") == 1) { "upsert doesn't duplicate" }
}

fun testDbAllPreservesInsertionOrder() {
    val db = PyreonDatabase()
    db.insert("todos", PyreonRecord("a"))
    db.insert("todos", PyreonRecord("b"))
    db.insert("todos", PyreonRecord("c"))
    check(db.all("todos").map { it.id } == listOf("a", "b", "c")) { "all() preserves insertion order" }
    // upsert keeps original position
    db.insert("todos", PyreonRecord("a", mapOf("x" to "1")))
    check(db.all("todos").map { it.id } == listOf("a", "b", "c")) { "upsert keeps position" }
}

fun testDbDelete() {
    val db = PyreonDatabase()
    db.insert("todos", PyreonRecord("1"))
    check(db.count("todos") == 1) { "one record" }
    check(db.delete("todos", "1")) { "delete returns true" }
    check(db.get("todos", "1") == null) { "deleted record gone" }
    check(db.count("todos") == 0) { "count back to zero" }
}

fun testDbDeleteAbsentIsIdempotent() {
    val db = PyreonDatabase()
    check(db.delete("todos", "never")) { "delete of absent id is idempotent (true)" }
}

fun testDbFind() {
    val db = PyreonDatabase()
    db.insert("todos", PyreonRecord("1", mapOf("done" to "false")))
    db.insert("todos", PyreonRecord("2", mapOf("done" to "true")))
    db.insert("todos", PyreonRecord("3", mapOf("done" to "false")))
    val open = db.find("todos", "done", "false")
    check(open.map { it.id } == listOf("1", "3")) { "find returns matching records in order" }
    check(db.find("todos", "done", "true").size == 1) { "find on other value" }
    check(db.find("todos", "missing", "x").isEmpty()) { "find on missing field → empty" }
}

fun testDbCollectionsAreIsolated() {
    val db = PyreonDatabase()
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

fun main() {
    testDbInsertGet()
    testDbUpsert()
    testDbAllPreservesInsertionOrder()
    testDbDelete()
    testDbDeleteAbsentIsIdempotent()
    testDbFind()
    testDbCollectionsAreIsolated()
    testDbFacadeRoutesThroughBackend()
    println("[PyreonDatabaseTest] all smoke tests passed")
}
