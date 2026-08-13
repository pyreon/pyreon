// PyreonCrdt convergence + wire-compat assertions (Android). Byte-aligned with
// PyreonCrdtTests.swift + the web pyreon-adapter tests — same `{ops}` wire format
// + LWW merge, so an Android peer converges with a web and an iOS peer.

import com.pyreon.runtime.PYREON_SYNCED_DEFAULT_MAP
import com.pyreon.runtime.PyreonCrdtDoc
import com.pyreon.runtime.PyreonScalar
import com.pyreon.runtime.PyreonSyncChannel
import com.pyreon.runtime.PyreonSyncTransport
import com.pyreon.runtime.PyreonSyncedSignal

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

    // 6. PyreonSyncedSignal — the Signal<T> facade over a shared doc.
    val doc = PyreonCrdtDoc("sig")
    val title = PyreonSyncedSignal(doc, "title", "")
    check(title() == "", "synced signal reads its initial when absent")
    title.set("Roadmap")
    check(title() == "Roadmap", "set updates the value")
    check(doc.get(PYREON_SYNCED_DEFAULT_MAP, "title") == PyreonScalar.Str("Roadmap"), "set writes one CRDT op")

    // A second signal on the same doc+key sees the present value win.
    val title2 = PyreonSyncedSignal(doc, "title", "IGNORED")
    check(title2() == "Roadmap", "a present key wins over a second signal's initial")

    // Independent keys; a numeric (Double) signal and a boolean.
    val count = PyreonSyncedSignal(doc, "count", 0.0)
    check(count() == 0.0, "numeric signal initial")
    count.set(5.0)
    check(count() == 5.0, "numeric set")
    check(title() == "Roadmap", "sibling key unaffected")
    val done = PyreonSyncedSignal(doc, "done", false)
    done.set(true)
    check(done(), "boolean set")

    // 7. A remote op updates the signal's value via the doc observer.
    val remote = PyreonCrdtDoc("b2")
    remote.applyOps(doc.encodeState()) // catch up to A's clock
    remote.set(PYREON_SYNCED_DEFAULT_MAP, "title", PyreonScalar.Str("from-remote")) // newer op
    doc.applyOps(remote.encodeState())
    check(title() == "from-remote", "a remote op updates the signal via the doc observer")

    title.dispose() // idempotent
    title.dispose()

    // 8. PyreonSyncTransport — the native equivalent of the web
    //    `connectPyreonSync(doc, channel)`, proven device-free over an
    //    in-memory relay.
    syncTransportTests()

    println("[PyreonCrdtTest] all assertions passed")
}

/**
 * An in-memory string-duplex the two transports share — the device-free proof.
 * `send` counts + forwards to the peer (when live); `deliver` invokes the inbound
 * handler directly (models a frame arriving); `fireOpen` invokes the stored open
 * callback (models the channel becoming ready).
 */
private class TransportMemoryChannel : PyreonSyncChannel {
    var peer: TransportMemoryChannel? = null
    private var onMsg: ((String) -> Unit)? = null
    private var onOpenCb: (() -> Unit)? = null
    private var live = true
    var sendCount = 0
    override fun send(data: String) { sendCount++; if (live) peer?.deliver(data) }
    fun deliver(data: String) { onMsg?.invoke(data) }
    override fun onMessage(cb: (String) -> Unit) { onMsg = cb }
    override fun onOpen(cb: () -> Unit) { onOpenCb = cb }
    override fun close() { live = false }
    fun fireOpen() { onOpenCb?.invoke() }
}

/** Called from `main()` (a second `main`/`*Test.kt` would break the co-source gate). */
private fun syncTransportTests() {
    // 1. Initial full-state on open: a pre-connect write reaches the peer.
    val docA = PyreonCrdtDoc("a1")
    val docB = PyreonCrdtDoc("z9") // distinct actorIds
    docA.set("m", "k", PyreonScalar.Str("pre")) // offline — no transport yet
    val chA = TransportMemoryChannel()
    val chB = TransportMemoryChannel()
    chA.peer = chB
    chB.peer = chA
    val tA = PyreonSyncTransport(docA, chA)
    val tB = PyreonSyncTransport(docB, chB)
    chA.fireOpen() // A → B: full state
    chB.fireOpen() // B → A: full state
    check(docB.get("m", "k") == PyreonScalar.Str("pre"), "pre-connect state reaches B on open")

    // 2. Live convergence both directions.
    docA.set("m", "live1", PyreonScalar.Str("v1"))
    check(docB.get("m", "live1") == PyreonScalar.Str("v1"), "A→B live op")
    docB.set("m", "live2", PyreonScalar.Str("v2"))
    check(docA.get("m", "live2") == PyreonScalar.Str("v2"), "B→A live op")

    // 3. Concurrent-offline convergence to the deterministic LWW winner
    //    (both clock 1 → equal-clock tie broken by the higher actor).
    val docC = PyreonCrdtDoc("a1")
    val docD = PyreonCrdtDoc("z9")
    docC.set("doc", "title", PyreonScalar.Str("from-C"))
    docD.set("doc", "title", PyreonScalar.Str("from-D"))
    val chC = TransportMemoryChannel()
    val chD = TransportMemoryChannel()
    chC.peer = chD
    chD.peer = chC
    val tC = PyreonSyncTransport(docC, chC)
    val tD = PyreonSyncTransport(docD, chD)
    chC.fireOpen()
    chD.fireOpen()
    check(docC.get("doc", "title") == PyreonScalar.Str("from-D"), "C converges to LWW winner from-D")
    check(docD.get("doc", "title") == PyreonScalar.Str("from-D"), "D stays LWW winner from-D")

    // 4. Loop-prevention LOCK: an applied remote op is NOT re-broadcast.
    //    (Structural — applyMessage fires observers but emits no onLocalOps.)
    chC.sendCount = 0
    docD.set("doc", "note", PyreonScalar.Str("hi")) // D → C, C merges via applyMessage
    check(docC.get("doc", "note") == PyreonScalar.Str("hi"), "remote op merged on C")
    check(chC.sendCount == 0, "C did NOT echo the applied remote op")

    // 5. dispose isolation: post-dispose local writes stop relaying, but the
    //    SHARED doc survives (get still works).
    tC.dispose()
    docC.set("doc", "after", PyreonScalar.Str("afterval"))
    check(docD.get("doc", "after") == null, "post-dispose write does not reach the peer")
    check(docC.get("doc", "after") == PyreonScalar.Str("afterval"), "shared doc survives dispose")
    tC.dispose() // idempotent — no crash

    // 6. Malformed inbound is ignored (no throw, state uncorrupted).
    val titleBefore = docD.get("doc", "title")
    chD.deliver("not json{")
    check(docD.get("doc", "title") == titleBefore, "malformed inbound ignored, state uncorrupted")

    // Keep the connected-pair transports referenced; dispose to clean up.
    tA.dispose()
    tB.dispose()
    tD.dispose()
}
