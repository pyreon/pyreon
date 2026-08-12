// PyreonCrdt convergence + wire-compat assertions (Android). Byte-aligned with
// PyreonCrdtTests.swift + the web pyreon-adapter tests — same `{ops}` wire format
// + LWW merge, so an Android peer converges with a web and an iOS peer.

import com.pyreon.runtime.PyreonCrdtDoc
import com.pyreon.runtime.PyreonScalar

private fun check(cond: Boolean, msg: String) {
    if (!cond) throw AssertionError("PyreonCrdtTest: $msg")
}

fun main() {
    // 1. Concurrent offline writes converge to the deterministic winner.
    val a = PyreonCrdtDoc("a1")
    val b = PyreonCrdtDoc("z9")
    a.set("doc", "title", PyreonScalar.Str("from-A"))
    b.set("doc", "title", PyreonScalar.Str("from-B"))
    b.applyOps(a.encodeState())
    a.applyOps(b.encodeState())
    check(a.get("doc", "title") == PyreonScalar.Str("from-B"), "A converges to from-B")
    check(b.get("doc", "title") == PyreonScalar.Str("from-B"), "B converges to from-B")

    // 2. Higher clock wins regardless of actor.
    val c = PyreonCrdtDoc("z9")
    val d = PyreonCrdtDoc("a1")
    c.set("m", "k", PyreonScalar.Str("first"))
    d.applyOps(c.encodeState())
    d.set("m", "k", PyreonScalar.Str("second"))
    c.applyOps(d.encodeState())
    check(c.get("m", "k") == PyreonScalar.Str("second"), "higher clock wins")

    // 3. Wire round-trip in the exact web/JS format.
    val e = PyreonCrdtDoc("e1")
    val f = PyreonCrdtDoc("f1")
    var relayed = ""
    e.onLocalOps = { ops -> relayed = e.encodeMessage(ops) }
    e.set("m", "n", PyreonScalar.Num(42.0))
    check(relayed.contains("\"ops\""), "message has ops")
    check(relayed.contains("\"value\":42"), "message has scalar 42")
    f.applyMessage(relayed)
    check(f.get("m", "n") == PyreonScalar.Num(42.0), "peer merged the wire message")

    // 4. Decode a message in the exact web/JS format (cross-engine).
    val g = PyreonCrdtDoc("g1")
    g.applyMessage("{\"ops\":[{\"map\":\"doc\",\"key\":\"t\",\"value\":\"from-web\",\"clock\":5,\"actor\":\"web-peer\"}]}")
    check(g.get("doc", "t") == PyreonScalar.Str("from-web"), "decodes a web-format message")

    // 5. Malformed is ignored.
    g.applyMessage("not json{")
    check(g.get("doc", "t") == PyreonScalar.Str("from-web"), "malformed ignored")

    println("[PyreonCrdtTest] all assertions passed")
}
