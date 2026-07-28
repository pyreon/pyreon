// The PyreonStorage BACKEND LAYER — the storage interface, the in-memory and
// file-backed implementations, the process registry, and the policy that
// decides which one an app ends up with.
//
// All of it is dependency-free (plain `java.io.File`), which is the point:
// `scripts/run-kotlin-tests.ts` only EXECUTES modules importing no
// `androidx.*`/`android.*`/`kotlinx.*`. `rememberPyreonStorage` needs Compose,
// so anything living beside it can be typechecked and never run — and
// "does a value survive the process" plus "does installing a default clobber
// the app's own backend" are precisely the questions a typecheck cannot
// answer. Only the Context lookup stays Android-bound, in
// PyreonStorageAndroid.kt.
//
// ## Why this file exists
//
// Until 2026-07 there wasn't one. `PyreonStorageRegistry.backend` defaulted to
// [InMemoryBackend], the docs pointed at a `DataStoreBackend` for "actual
// cross-launch persistence" — and that class did not exist anywhere in the
// repo, nor did any example app assign the registry. So the most-used hook in
// the framework silently lost every value on process death, on the platform
// where process death is routine.
//
// It looked proven, which is the part worth remembering. The Android device
// gate asserted `todosPersistAcrossActivityRecreation` — and activity
// recreation keeps the PROCESS, so the in-memory map survives it. A green test
// named "persist" was measuring the one form of persistence that needed no
// persistence layer at all. (The matrix disclosed the scope honestly; nothing
// closed the gap.)
//
// iOS had none of this: `@PyreonAppStorage` is UserDefaults-backed, so the
// same shared source persisted there and not here — a parity break of the
// exact kind that only shows up when you RUN the app on both platforms.
//
// ## Design
//
// One JSON object, `<dir>/storage.json`, key -> already-encoded string value
// (the caller has serialized to a string before it reaches a backend, so this
// layer stores strings and stays type-agnostic).
//
// Dependency-free on purpose, and in its OWN file on purpose:
// `scripts/run-kotlin-tests.ts` only RUNS modules that import no `androidx.*` /
// `android.*` / `kotlinx.*`. `PyreonStorage.kt` imports Compose, so its tests
// are typecheck-only — putting the persistence logic there would have made the
// persistence test unexecutable. Here it is plain `java.io.File`, so the test
// genuinely runs. The Android `Context` lookup lives in PyreonStorageAndroid.kt
// for the same reason.
//
// Failure is non-fatal, matching the storage contract elsewhere: an unreadable
// or corrupt file reads as empty, and a failed write is dropped after
// [onError]. Losing a preference is bad; crashing the app because the disk is
// full is worse.

package com.pyreon.runtime

import java.io.File

/**
 * Pluggable storage backend — values are already-encoded strings (the caller
 * serializes before it reaches a backend), so this layer stays type-agnostic.
 *
 * Concrete implementations:
 *
 * - [FileStorageBackend] (this file) — the DEFAULT once a `Context` is
 *   available. Survives process death.
 * - [InMemoryBackend] (PyreonStorage.kt) — process-scope map, for unit tests,
 *   Composable previews, and the kotlinc validation harness.
 *
 * Declared here rather than beside the registry so that this file, and its
 * persistence test, compile with no Compose on the classpath.
 */
public interface PyreonStorageBackend {
    public fun read(key: String): String?
    public fun write(key: String, value: String)
    public fun remove(key: String)
}

/**
 * Process-scope in-memory backend. Loses data on process exit, but survives
 * the application's lifetime — for unit tests, Composable previews, and the
 * kotlinc validation harness.
 *
 * This was the DEFAULT until 2026-07, which is how `useStorage()` came to
 * silently lose every value on process death.
 */
public class InMemoryBackend : PyreonStorageBackend {
    private val map: MutableMap<String, String> = mutableMapOf()

    override fun read(key: String): String? = map[key]
    override fun write(key: String, value: String) {
        map[key] = value
    }
    override fun remove(key: String) {
        map.remove(key)
    }
}

/**
 * Active backend for the process.
 *
 * Starts as [InMemoryBackend] so unit tests and Composable previews work with
 * no wiring, and is replaced with a persistent one the first time
 * `rememberPyreonStorage` runs (see [installDefaultStorageBackend]). An app
 * that wants something else — Room, DataStore, an encrypted store — assigns
 * this in `Application.onCreate` and keeps it.
 */
public object PyreonStorageRegistry {
    public var backend: PyreonStorageBackend = InMemoryBackend()
}

/**
 * Install [make]'s backend as the process default — but ONLY if the app has
 * not chosen one.
 *
 * The guard is the whole contract. An app that assigned
 * `PyreonStorageRegistry.backend` in `Application.onCreate` made a deliberate
 * choice, and a framework default that overwrites it on first composition
 * would be a worse bug than the one this exists to fix: silently ignoring an
 * encrypted or synced store and writing plaintext next to it.
 *
 * [make] is a lambda so the (possibly expensive) backend is not constructed
 * when the app already has one — and so this policy stays testable without an
 * Android `Context`.
 */
public fun installDefaultStorageBackend(make: () -> PyreonStorageBackend) {
    if (PyreonStorageRegistry.backend is InMemoryBackend) {
        PyreonStorageRegistry.backend = make()
    }
}

/** Minimal JSON codec for a flat `String -> String` map — the only shape this
 * backend stores. Dependency-free so it behaves identically on Android, on a
 * plain JVM test, and under the stub-only `kotlinc` verification, where a
 * stubbed `org.json` / kotlinx-serialization would make a persistence test
 * assert nothing at all. */
internal object PyreonKvJson {
    fun encode(map: Map<String, String>): String {
        val sb = StringBuilder("{")
        map.keys.sorted().forEachIndexed { i, k ->
            if (i > 0) sb.append(',')
            escape(sb, k); sb.append(':'); escape(sb, map.getValue(k))
        }
        return sb.append('}').toString()
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

    /** Returns null on malformed input so a corrupt file becomes "no stored
     * values" rather than a crash on launch. */
    fun decode(text: String): Map<String, String>? {
        var i = 0
        fun ws() { while (i < text.length && text[i].isWhitespace()) i++ }
        fun eat(c: Char): Boolean {
            if (i < text.length && text[i] == c) { i++; return true }
            return false
        }
        fun str(): String? {
            if (!eat('"')) return null
            val sb = StringBuilder()
            while (i < text.length) {
                val c = text[i++]
                when {
                    c == '"' -> return sb.toString()
                    c == '\\' -> {
                        if (i >= text.length) return null
                        when (val e = text[i++]) {
                            '"' -> sb.append('"')
                            '\\' -> sb.append('\\')
                            '/' -> sb.append('/')
                            'n' -> sb.append('\n')
                            'r' -> sb.append('\r')
                            't' -> sb.append('\t')
                            'b' -> sb.append('\b')
                            'f' -> sb.append('\u000C')
                            'u' -> {
                                if (i + 4 > text.length) return null
                                sb.append(text.substring(i, i + 4).toInt(16).toChar()); i += 4
                            }
                            else -> sb.append(e)
                        }
                    }
                    else -> sb.append(c)
                }
            }
            return null
        }

        return try {
            ws()
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
            out
        } catch (_: Exception) {
            null
        }
    }
}

/** File-backed key/value storage — what `rememberPyreonStorage` uses by
 * default once a `Context` is available (see PyreonStorageAndroid.kt).
 *
 * Values survive process death, which [InMemoryBackend] never did. */
public class FileStorageBackend(
    private val directory: File,
    private val onError: ((String, Throwable) -> Unit)? = null,
) : PyreonStorageBackend {
    private var loaded = false
    private val map = LinkedHashMap<String, String>()

    init {
        try {
            directory.mkdirs()
        } catch (t: Throwable) {
            onError?.invoke("createDirectory", t)
        }
    }

    /** Where this backend keeps its file. */
    public val directoryFile: File get() = directory

    private fun file(): File = File(directory, "storage.json")

    private fun load() {
        if (loaded) return
        loaded = true
        val f = file()
        if (!f.exists()) return
        try {
            val parsed = PyreonKvJson.decode(f.readText())
            if (parsed == null) {
                onError?.invoke("load", IllegalStateException("corrupt JSON"))
                return
            }
            map.putAll(parsed)
        } catch (t: Throwable) {
            onError?.invoke("load", t)
        }
    }

    private fun flush() {
        try {
            // Write-then-rename: a crash mid-write leaves the PREVIOUS file
            // intact rather than a truncated one.
            val target = file()
            val tmp = File(directory, target.name + ".tmp")
            tmp.writeText(PyreonKvJson.encode(map))
            if (!tmp.renameTo(target)) {
                target.delete()
                if (!tmp.renameTo(target)) throw IllegalStateException("rename failed")
            }
        } catch (t: Throwable) {
            onError?.invoke("flush", t)
        }
    }

    override fun read(key: String): String? {
        load()
        return map[key]
    }

    override fun write(key: String, value: String) {
        load()
        map[key] = value
        flush()
    }

    override fun remove(key: String) {
        load()
        map.remove(key)
        flush()
    }
}
