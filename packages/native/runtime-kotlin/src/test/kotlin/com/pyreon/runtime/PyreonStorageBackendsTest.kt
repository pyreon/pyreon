// FileStorageBackend — the persistence `useStorage()` did not have on Android.
//
// These RUN (plain java.io.File, no stubs), which is why the backend lives in
// its own dependency-free file: PyreonStorage.kt imports Compose, so its tests
// are typecheck-only and could never have proven this.
//
// A SECOND backend over the SAME directory is exactly what a relaunch is — no
// in-process map carries over, so anything the second instance reads came off
// the disk. That distinction is the whole bug: the Android device gate's
// `todosPersistAcrossActivityRecreation` kept the PROCESS alive, so the old
// in-memory map survived it and the test passed while nothing persisted.

package com.pyreon.runtime

import java.io.File

internal fun tempKvDir(label: String): File {
    val dir = File(System.getProperty("java.io.tmpdir"), "pyreon-kv-$label-${System.nanoTime()}")
    dir.mkdirs()
    return dir
}

fun testKvPersistsAcrossInstances() {
    val dir = tempKvDir("persist")
    try {
        FileStorageBackend(dir).write("todos", """[{"id":1,"text":"buy milk"}]""")
        val relaunched = FileStorageBackend(dir)
        check(relaunched.read("todos") == """[{"id":1,"text":"buy milk"}]""") {
            "a fresh backend over the same dir must read what the first wrote"
        }
    } finally {
        dir.deleteRecursively()
    }
}

fun testKvOverwriteAndRemovePersist() {
    // A remove that only clears the in-memory map would "work" in-process and
    // resurrect the value on relaunch — the nastier half of the bug.
    val dir = tempKvDir("mutate")
    try {
        val a = FileStorageBackend(dir)
        a.write("theme", "dark")
        a.write("locale", "de")
        a.write("theme", "light")
        a.remove("locale")

        val b = FileStorageBackend(dir)
        check(b.read("theme") == "light") { "overwrite persisted" }
        check(b.read("locale") == null) { "removed key must not come back" }
    } finally {
        dir.deleteRecursively()
    }
}

fun testKvMissingKeyIsNull() {
    val dir = tempKvDir("missing")
    try {
        check(FileStorageBackend(dir).read("nope") == null) { "absent key reads null, not empty string" }
    } finally {
        dir.deleteRecursively()
    }
}

fun testKvSurvivesCorruptFile() {
    // Degrade to "no stored values"; never crash on launch.
    val dir = tempKvDir("corrupt")
    try {
        File(dir, "storage.json").writeText("{ not json")
        val reported = mutableListOf<String>()
        val a = FileStorageBackend(dir) { op, _ -> reported.add(op) }
        check(a.read("theme") == null) { "corrupt file reads as empty, not a throw" }
        check(reported == listOf("load")) { "the failure is reported, not swallowed: $reported" }
        a.write("theme", "dark")
        check(FileStorageBackend(dir).read("theme") == "dark") { "recovers after a write" }
    } finally {
        dir.deleteRecursively()
    }
}

fun testKvJsonRoundTripsAdversarialStrings() {
    // The codec is hand-written (a stubbed JSON lib would make the persistence
    // tests vacuous in CI), so it earns its own escaping test. Encoded app
    // values ARE JSON strings, so quotes and backslashes are the common case
    // here, not the exotic one.
    val nasty = mapOf(
        "json" to """{"todos":[{"text":"say \"hi\"","done":false}]}""",
        "backslash" to """C:\path\\to""",
        "newline" to "line1\nline2\r\n",
        "tab" to "a\tb",
        "unicode" to "héllo → 世界 🎉",
        "control" to "bell: \u0007 vtab: \u000B",
        "empty" to "",
    )
    val decoded = PyreonKvJson.decode(PyreonKvJson.encode(nasty))
    check(decoded == nasty) { "round trip lost data:\n  got $decoded\n  want $nasty" }
    check(PyreonKvJson.decode("") == null) { "empty input is malformed" }
    check(PyreonKvJson.decode("""{"a":""") == null) { "truncated input is malformed" }
    check(PyreonKvJson.decode("{}") == emptyMap<String, String>()) { "empty object is valid and empty" }
}

fun testKvOnDiskFormatIsStable() {
    // Sorted keys, no whitespace — deterministic bytes, so a format drift is a
    // test failure rather than a surprise on someone's device.
    val dir = tempKvDir("format")
    try {
        val a = FileStorageBackend(dir)
        a.write("theme", "dark")
        a.write("count", "2")
        val raw = File(dir, "storage.json").readText()
        check(raw == """{"count":"2","theme":"dark"}""") { "on-disk format drifted: $raw" }
    } finally {
        dir.deleteRecursively()
    }
}


// ---------------------------------------------------------------------------
// installDefaultStorageBackend — the policy, not the plumbing.
//
// A framework that installs a default over an app's DELIBERATE choice is a
// worse bug than the one this change fixes: it would silently ignore an
// encrypted or synced store and write plaintext next to it. So the guard gets
// its own tests in both directions.
//
// (The first version of this file had none. Deleting the guard entirely left
// every test green — which is exactly the shape of an untested invariant.)

private class SpyBackend : PyreonStorageBackend {
    val map = mutableMapOf<String, String>()
    override fun read(key: String): String? = map[key]
    override fun write(key: String, value: String) { map[key] = value }
    override fun remove(key: String) { map.remove(key) }
}

private fun withFreshRegistry(body: () -> Unit) {
    val saved = PyreonStorageRegistry.backend
    PyreonStorageRegistry.backend = InMemoryBackend()
    try {
        body()
    } finally {
        PyreonStorageRegistry.backend = saved
    }
}

fun testInstallDefaultReplacesTheUnconfiguredBackend() {
    withFreshRegistry {
        val dir = tempKvDir("install")
        try {
            installDefaultStorageBackend { FileStorageBackend(dir) }
            check(PyreonStorageRegistry.backend is FileStorageBackend) {
                "the unconfigured in-memory default must be replaced — otherwise nothing persists"
            }
        } finally {
            dir.deleteRecursively()
        }
    }
}

fun testInstallDefaultNeverClobbersTheAppsChoice() {
    withFreshRegistry {
        val chosen = SpyBackend()
        PyreonStorageRegistry.backend = chosen // as an app would, in onCreate
        var constructed = 0
        installDefaultStorageBackend { constructed++; InMemoryBackend() }
        check(PyreonStorageRegistry.backend === chosen) {
            "an app that chose a backend must keep it"
        }
        check(constructed == 0) {
            "the factory must not even run when a backend is already chosen — it may be expensive"
        }
    }
}

fun testInstallDefaultIsIdempotent() {
    // rememberPyreonStorage calls this per composition tree; a second call
    // must not swap in a fresh backend and drop the first one's cached state.
    withFreshRegistry {
        val dir = tempKvDir("idempotent")
        try {
            installDefaultStorageBackend { FileStorageBackend(dir) }
            val first = PyreonStorageRegistry.backend
            installDefaultStorageBackend { FileStorageBackend(dir) }
            check(PyreonStorageRegistry.backend === first) { "second install must be a no-op" }
        } finally {
            dir.deleteRecursively()
        }
    }
}

fun main() {
    testKvPersistsAcrossInstances()
    testKvOverwriteAndRemovePersist()
    testKvMissingKeyIsNull()
    testKvSurvivesCorruptFile()
    testKvJsonRoundTripsAdversarialStrings()
    testKvOnDiskFormatIsStable()
    testInstallDefaultReplacesTheUnconfiguredBackend()
    testInstallDefaultNeverClobbersTheAppsChoice()
    testInstallDefaultIsIdempotent()
    println("[PyreonStorageBackendsTest] all smoke tests passed")
}
