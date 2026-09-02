package com.pyreon.runtime

// PyreonCrdt — the Android-native port of @pyreon/sync's dependency-free LWW CRDT
// engine (`pyreonAdapter`). Wire-COMPATIBLE with the TypeScript AND Swift engines:
// the same `{ "ops": [{ map, key, value, clock, actor }] }` JSON messages and the
// same last-writer-wins merge (higher Lamport clock wins; an equal clock is
// broken by the higher actor id). An Android peer, an iOS peer, and a web peer
// editing the same document CONVERGE — 1:1 functionality pairing.
//
// Scope matches the v1 seam: a map is a flat key -> scalar register (whole-value
// replacement). Rich Y.Text/Y.Array stay on the JS/Yjs engine for now.
//
// The JSON codec is HAND-WRITTEN (not org.json / kotlinx-serialization) on
// purpose: this runtime compiles against minimal stubs, where those would be
// stubs that silently no-op — the exact masking PyreonDatabase's hand-written
// codec avoids. This file is the pure engine + codec (no Compose import) so it
// compiles standalone and unit-tests headlessly; the `mutableStateOf` binding +
// PyreonWebSocket transport wiring layer on top.

/** A JSON scalar — the value a v1 register holds. */
sealed class PyreonScalar {
    data class Str(val v: String) : PyreonScalar()
    data class Num(val v: Double) : PyreonScalar()
    data class Bool(val v: Boolean) : PyreonScalar()
    object Null : PyreonScalar()
}

/** One op on the wire — identical field names to the TS/Swift `PyreonCrdtOp`. */
data class PyreonCrdtOp(
    val map: String,
    val key: String,
    val value: PyreonScalar,
    val clock: Int,
    val actor: String,
)

private data class Register(val value: PyreonScalar, val clock: Int, val actor: String)

/** LWW total order identical to TS/Swift: higher clock; equal clock -> higher actor. */
private fun remoteWins(local: Register, remoteClock: Int, remoteActor: String): Boolean {
    if (remoteClock != local.clock) return remoteClock > local.clock
    return remoteActor > local.actor
}

/**
 * A handle bound to one map inside a document — the native twin of the web
 * `CrdtMap` returned by `doc.getMap(name)`.
 *
 * The engine stores every map in one flat table and its methods therefore take
 * the map name as a first argument. That is a fine INTERNAL shape and the wrong
 * AUTHORING shape: shared source is written against the web API, where a map is
 * a value you hold. Without this handle `doc.getMap("room").set("k", v)` — the
 * ordinary way to write it — lowered to native code referencing a `getMap` that
 * did not exist, and PMTC emitted it verbatim with no warning, so the failure
 * arrived as a Kotlin compile error in a generated file rather than as a
 * diagnostic naming the unsupported call.
 *
 * The `set` overloads exist for the same reason. `PyreonScalar` is a sealed
 * type, so the natural `map.set("k", "v")` cannot type-check against a bare
 * `PyreonScalar` parameter; requiring the wrapper in shared source would put a
 * Kotlin constructor in a file that also has to compile as TypeScript.
 */
class PyreonCrdtMap internal constructor(
    private val doc: PyreonCrdtDoc,
    private val name: String,
) {
    fun get(key: String): PyreonScalar? = doc.get(name, key)
    fun has(key: String): Boolean = doc.has(name, key)
    fun keys(): List<String> = doc.keys(name)

    fun set(key: String, value: PyreonScalar) = doc.set(name, key, value)
    fun set(key: String, value: String) = doc.set(name, key, PyreonScalar.Str(value))
    fun set(key: String, value: Int) = doc.set(name, key, PyreonScalar.Num(value.toDouble()))
    fun set(key: String, value: Double) = doc.set(name, key, PyreonScalar.Num(value))
    fun set(key: String, value: Boolean) = doc.set(name, key, PyreonScalar.Bool(value))

    /** Observe changes to THIS map. Returns an unsubscribe, as on the web. */
    fun observe(cb: (Set<String>) -> Unit): () -> Unit = doc.observe(name, cb)
}

/** The pure LWW document engine, wire-compatible with the TS/Swift `PyreonCrdtDoc`. */
class PyreonCrdtDoc(val actor: String) {
    private var clock = 0
    private val maps = HashMap<String, HashMap<String, Register>>()
    private val observers = HashMap<Int, (String, Set<String>) -> Unit>()
    private var nextObserver = 0

    /** Emits ops from LOCAL writes (the transport relays them). Remote merges
     *  emit nothing here — no echo re-broadcast (structural). */
    var onLocalOps: ((List<PyreonCrdtOp>) -> Unit)? = null

    /**
     * The map handle for [name] — the native twin of the web `doc.getMap(name)`.
     * Handles are values, not registrations: two calls with the same name address
     * the same underlying map, and holding one costs nothing.
     */
    fun getMap(name: String): PyreonCrdtMap = PyreonCrdtMap(this, name)

    fun get(map: String, key: String): PyreonScalar? = maps[map]?.get(key)?.value
    fun has(map: String, key: String): Boolean = maps[map]?.containsKey(key) == true
    fun keys(map: String): List<String> = maps[map]?.keys?.toList() ?: emptyList()

    fun observe(map: String, cb: (Set<String>) -> Unit): () -> Unit {
        val id = nextObserver++
        observers[id] = { changedMap, keys -> if (changedMap == map) cb(keys) }
        return { observers.remove(id) }
    }

    /** A local write — stamp a fresh (clock, actor). LWW no-op on an equal scalar. */
    fun set(map: String, key: String, value: PyreonScalar) {
        val existing = maps[map]?.get(key)
        if (existing != null && existing.value == value) return
        clock += 1
        val reg = Register(value, clock, actor)
        maps.getOrPut(map) { HashMap() }[key] = reg
        fire(map, setOf(key))
        onLocalOps?.invoke(listOf(PyreonCrdtOp(map, key, value, reg.clock, reg.actor)))
    }

    /** Merge inbound ops (LWW). Advances the clock; fires observers; no re-broadcast. */
    fun applyOps(ops: List<PyreonCrdtOp>) {
        if (ops.isEmpty()) return
        val changedByMap = HashMap<String, MutableSet<String>>()
        for (op in ops) {
            if (op.clock > clock) clock = op.clock
            val local = maps[op.map]?.get(op.key)
            if (local != null && !remoteWins(local, op.clock, op.actor)) continue
            if (local != null && local.value == op.value && local.clock == op.clock) continue
            maps.getOrPut(op.map) { HashMap() }[op.key] = Register(op.value, op.clock, op.actor)
            changedByMap.getOrPut(op.map) { HashSet() }.add(op.key)
        }
        for ((map, keys) in changedByMap) fire(map, keys)
    }

    /** Full state as an op list — each register carries its stamp, so a state
     *  dump merges convergently in any order. Sent on connect. */
    fun encodeState(): List<PyreonCrdtOp> {
        val out = ArrayList<PyreonCrdtOp>()
        for ((mapName, regs) in maps) {
            for ((key, reg) in regs) {
                out.add(PyreonCrdtOp(mapName, key, reg.value, reg.clock, reg.actor))
            }
        }
        return out
    }

    /** Encode a `{ ops }` message to the exact JSON the TS/Swift transport reads. */
    fun encodeMessage(ops: List<PyreonCrdtOp>): String {
        val sb = StringBuilder("{\"ops\":[")
        for ((i, op) in ops.withIndex()) {
            if (i > 0) sb.append(',')
            sb.append("{\"map\":").append(jsonStr(op.map))
            sb.append(",\"key\":").append(jsonStr(op.key))
            sb.append(",\"value\":").append(jsonScalar(op.value))
            sb.append(",\"clock\":").append(op.clock)
            sb.append(",\"actor\":").append(jsonStr(op.actor))
            sb.append('}')
        }
        sb.append("]}")
        return sb.toString()
    }

    /** Decode + apply a `{ ops }` message. Malformed input is ignored (no throw). */
    fun applyMessage(json: String) {
        val ops = try {
            JsonReader(json).readOpsMessage()
        } catch (_: Exception) {
            null
        }
        if (ops != null) applyOps(ops)
    }

    private fun fire(map: String, keys: Set<String>) {
        for (cb in observers.values.toList()) cb(map, keys)
    }
}

// ─── Hand-written JSON (scalar-scope) — matches the TS/Swift wire bytes ───────

private fun jsonStr(s: String): String {
    val sb = StringBuilder("\"")
    for (ch in s) {
        when (ch) {
            '"' -> sb.append("\\\"")
            '\\' -> sb.append("\\\\")
            '\n' -> sb.append("\\n")
            '\r' -> sb.append("\\r")
            '\t' -> sb.append("\\t")
            else -> sb.append(ch)
        }
    }
    sb.append('"')
    return sb.toString()
}

private fun jsonScalar(v: PyreonScalar): String =
    when (v) {
        is PyreonScalar.Str -> jsonStr(v.v)
        is PyreonScalar.Num -> if (v.v == v.v.toLong().toDouble()) v.v.toLong().toString() else v.v.toString()
        is PyreonScalar.Bool -> if (v.v) "true" else "false"
        PyreonScalar.Null -> "null"
    }

/** A minimal recursive-descent reader for the fixed `{ ops: [ {5 fields} ] }`
 *  message shape (values are scalars). Throws on anything malformed. */
private class JsonReader(private val s: String) {
    private var i = 0

    fun readOpsMessage(): List<PyreonCrdtOp> {
        ws(); expect('{')
        val ops = ArrayList<PyreonCrdtOp>()
        while (true) {
            ws()
            val name = readString()
            ws(); expect(':')
            if (name == "ops") {
                ws(); expect('[')
                ws()
                if (peek() == ']') { i++ } else {
                    while (true) {
                        ops.add(readOp())
                        ws()
                        val c = next()
                        if (c == ']') break
                        if (c != ',') throw err()
                    }
                }
            } else {
                skipValue()
            }
            ws()
            val c = next()
            if (c == '}') break
            if (c != ',') throw err()
        }
        return ops
    }

    private fun readOp(): PyreonCrdtOp {
        ws(); expect('{')
        var map = ""; var key = ""; var actor = ""; var clock = 0
        var value: PyreonScalar = PyreonScalar.Null
        while (true) {
            ws()
            val field = readString()
            ws(); expect(':'); ws()
            when (field) {
                "map" -> map = readString()
                "key" -> key = readString()
                "actor" -> actor = readString()
                "clock" -> clock = readNumber().toInt()
                "value" -> value = readScalar()
                else -> skipValue()
            }
            ws()
            val c = next()
            if (c == '}') break
            if (c != ',') throw err()
        }
        return PyreonCrdtOp(map, key, value, clock, actor)
    }

    private fun readScalar(): PyreonScalar {
        ws()
        return when (peek()) {
            '"' -> PyreonScalar.Str(readString())
            't', 'f' -> PyreonScalar.Bool(readBool())
            'n' -> { readLiteral("null"); PyreonScalar.Null }
            else -> PyreonScalar.Num(readNumber())
        }
    }

    private fun readString(): String {
        ws(); expect('"')
        val sb = StringBuilder()
        while (true) {
            val c = next()
            if (c == '"') break
            if (c == '\\') {
                when (val e = next()) {
                    '"' -> sb.append('"'); '\\' -> sb.append('\\'); '/' -> sb.append('/')
                    'n' -> sb.append('\n'); 'r' -> sb.append('\r'); 't' -> sb.append('\t')
                    'b' -> sb.append('\b'); 'f' -> sb.append('')
                    'u' -> { val hex = s.substring(i, i + 4); i += 4; sb.append(hex.toInt(16).toChar()) }
                    else -> throw err("bad escape $e")
                }
            } else sb.append(c)
        }
        return sb.toString()
    }

    private fun readNumber(): Double {
        val start = i
        if (peek() == '-') i++
        while (i < s.length && (s[i].isDigit() || s[i] == '.' || s[i] == 'e' || s[i] == 'E' || s[i] == '+' || s[i] == '-')) i++
        return s.substring(start, i).toDouble()
    }

    private fun readBool(): Boolean =
        if (peek() == 't') { readLiteral("true"); true } else { readLiteral("false"); false }

    private fun readLiteral(lit: String) {
        if (!s.startsWith(lit, i)) throw err("expected $lit")
        i += lit.length
    }

    private fun skipValue() {
        ws()
        when (peek()) {
            '"' -> readString()
            '{' -> { expect('{'); var depth = 1; while (depth > 0) { val c = next(); if (c == '{') depth++; if (c == '}') depth-- } }
            '[' -> { expect('['); var depth = 1; while (depth > 0) { val c = next(); if (c == '[') depth++; if (c == ']') depth-- } }
            't', 'f' -> readBool()
            'n' -> readLiteral("null")
            else -> readNumber()
        }
    }

    private fun ws() { while (i < s.length && s[i].isWhitespace()) i++ }
    private fun peek(): Char = if (i < s.length) s[i] else throw err("unexpected end")
    private fun next(): Char { val c = peek(); i++; return c }
    private fun expect(c: Char) { if (next() != c) throw err("expected $c") }
    private fun err(msg: String = "malformed json"): Exception = IllegalArgumentException("$msg at $i")
}
