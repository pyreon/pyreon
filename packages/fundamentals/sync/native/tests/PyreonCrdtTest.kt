// PyreonCrdt convergence + wire-compat assertions (Android). Byte-aligned with
// PyreonCrdtTests.swift + the web pyreon-adapter tests — same `{ops}` wire format
// + LWW merge, so an Android peer converges with a web and an iOS peer.

import com.pyreon.runtime.PYREON_SYNCED_DEFAULT_MAP
import com.pyreon.runtime.PYREON_SYNCED_DEFAULTS_SUFFIX
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

    // 9. Create-if-missing DEFAULTS map (web #2519) — a default can never clobber
    //    real data on an actor tie-break.
    syncDefaultsTests()

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

/**
 * The create-if-missing SEED lands in a SEPARATE `"<map>:defaults"` map (web
 * #2519), so a fresh peer's default can never clobber real data — reads prefer the
 * real map. Called from `main()`.
 */
private fun syncDefaultsTests() {
    val defaultsMap = "$PYREON_SYNCED_DEFAULT_MAP$PYREON_SYNCED_DEFAULTS_SUFFIX"

    // 1. CLOBBER-FIXED convergence. Two fresh docs (distinct actors) each seed their
    //    OWN default OFFLINE — the fresh-peer race — then connect.
    val docA = PyreonCrdtDoc("aaa")
    val docB = PyreonCrdtDoc("zzz")
    val sigA = PyreonSyncedSignal(docA, "title", "A-default")
    val sigB = PyreonSyncedSignal(docB, "title", "B-default")
    // The seeds live only in each doc's DEFAULTS map; the REAL map is empty.
    check(docA.get(PYREON_SYNCED_DEFAULT_MAP, "title") == null, "seed did not touch A's real map")
    check(docB.get(PYREON_SYNCED_DEFAULT_MAP, "title") == null, "seed did not touch B's real map")
    check(docA.get(defaultsMap, "title") == PyreonScalar.Str("A-default"), "A seeded its defaults map")

    // Connect + open → full-state exchange; the two concurrent defaults tie-break.
    val chA = TransportMemoryChannel()
    val chB = TransportMemoryChannel()
    chA.peer = chB
    chB.peer = chA
    val tA = PyreonSyncTransport(docA, chA)
    val tB = PyreonSyncTransport(docB, chB)
    chA.fireOpen()
    chB.fireOpen()

    // Converge on ONE default (harmless tie among defaults), NOT diverge — and no
    // default ever leaked into the real map.
    check(sigA() == sigB(), "both signals converge on the same default")
    check(sigA() == "A-default" || sigA() == "B-default", "the converged value is one of the defaults")
    check(docA.get(defaultsMap, "title") == docB.get(defaultsMap, "title"), "defaults maps converged")
    check(docA.get(PYREON_SYNCED_DEFAULT_MAP, "title") == null, "no default leaked into A's real map")
    check(docB.get(PYREON_SYNCED_DEFAULT_MAP, "title") == null, "no default leaked into B's real map")

    // A REAL write now OUTRANKS any default on BOTH peers — the #2519 guarantee.
    sigA.set("real")
    check(sigA() == "real", "A reads its real write")
    check(sigB() == "real", "B converges to the real value — a default never outranks it")
    check(docB.get(PYREON_SYNCED_DEFAULT_MAP, "title") == PyreonScalar.Str("real"), "real value in B's real map")

    // 2. NO-TRANSPORT: the seed is immediate (into the defaults map); a later `set`
    //    writes the real map, which the read then follows.
    val solo = PyreonCrdtDoc("solo")
    val s = PyreonSyncedSignal(solo, "k", "seed")
    check(s() == "seed", "reads initial via the defaults resolve (no transport)")
    check(solo.get(PYREON_SYNCED_DEFAULT_MAP, "k") == null, "initial seeded the defaults map, not the real map")
    check(solo.get(defaultsMap, "k") == PyreonScalar.Str("seed"), "initial present in the defaults map")
    s.set("v")
    check(s() == "v", "read follows the real write")
    check(solo.get(PYREON_SYNCED_DEFAULT_MAP, "k") == PyreonScalar.Str("v"), "set wrote the real map")

    // 3. PRESENT-KEY-WINS: a pre-set REAL value beats `initial` (real precedence),
    //    and no default is seeded when a real value already exists.
    val pre = PyreonCrdtDoc("pre")
    pre.set(PYREON_SYNCED_DEFAULT_MAP, "k", PyreonScalar.Str("present"))
    val sPre = PyreonSyncedSignal(pre, "k", "IGNORED")
    check(sPre() == "present", "a present real value wins over initial")
    check(pre.get(defaultsMap, "k") == null, "no default seeded when a real value exists")

    // 4. DISPOSE SAFETY: dispose before any observe fires → later writes are ignored,
    //    no crash. dispose is idempotent.
    val dd = PyreonCrdtDoc("disp")
    val sd = PyreonSyncedSignal(dd, "k", "x")
    sd.dispose()
    sd.dispose() // idempotent
    dd.set(PYREON_SYNCED_DEFAULT_MAP, "k", PyreonScalar.Str("after"))
    check(sd() == "x", "a disposed signal ignores later writes, no crash")

    // 5. MAP HANDLE — the native twin of the web `doc.getMap(name)`.
    //    The engine's own methods take the map name as a first argument; shared
    //    source is written against the web API, where a map is a value you hold.
    //    Before this handle existed, the ordinary shape
    //    `doc.getMap("room").set("k", v)` lowered to native code calling a
    //    `getMap` that was not there — and PMTC emitted it verbatim with NO
    //    warning, so the failure surfaced as a kotlinc error in a generated file
    //    instead of a diagnostic naming the call.
    val hd = PyreonCrdtDoc("h1")
    val room = hd.getMap("room")

    //    The overloads are the other half: `PyreonScalar` is a sealed type, so
    //    `room.set("k", "v")` cannot type-check against a bare parameter, and
    //    requiring the wrapper would put a Kotlin constructor in a file that
    //    must also compile as TypeScript.
    room.set("title", "hello")
    room.set("n", 42)
    room.set("ok", true)
    room.set("ratio", 1.5)
    check(room.get("title") == PyreonScalar.Str("hello"), "handle set/get round-trips a String")
    //    Kotlin has ONE numeric case (`Num(Double)`) where Swift has `.int` and
    //    `.double`, so an Int widens here — asserted so the difference is a
    //    recorded property rather than a surprise at a call site.
    check(room.get("n") == PyreonScalar.Num(42.0), "handle set/get widens an Int to Num")
    check(room.get("ok") == PyreonScalar.Bool(true), "handle set/get round-trips a Bool")
    check(room.get("ratio") == PyreonScalar.Num(1.5), "handle set/get round-trips a Double")
    check(room.has("title"), "handle has")
    check(room.keys().size == 4, "handle keys")
    check(room.get("absent") == null, "handle get of an absent key is null")

    //    A handle is a VALUE, not a registration: two calls with the same name
    //    address the same underlying map.
    check(hd.getMap("room").get("title") == PyreonScalar.Str("hello"), "handles are not per-call state")
    check(hd.getMap("other").get("title") == null, "a different name is a different map")

    //    And the handle observes only its OWN map.
    var sawRoom = 0
    var sawOther = 0
    val offRoom = room.observe { sawRoom += 1 }
    val offOther = hd.getMap("other").observe { sawOther += 1 }
    room.set("title", "changed")
    check(sawRoom == 1, "handle observe fires for its own map")
    check(sawOther == 0, "handle observe does not fire for another map")
    offRoom()
    offOther()
    room.set("title", "again")
    check(sawRoom == 1, "handle observe unsubscribes")

    //    Cross-document convergence THROUGH the handle — the shape a device proof
    //    drives. A FRESH pair, deliberately: reusing `hd` asserts nothing, because
    //    its Lamport clock is at 6 after the writes above and a peer's clock-1
    //    write correctly LOSES. The Swift twin of this test failed exactly that
    //    way on first run.
    val localFresh = PyreonCrdtDoc("a1")
    val peer = PyreonCrdtDoc("z9")
    val localRoom = localFresh.getMap("room")
    localRoom.set("title", "from-local")
    peer.getMap("room").set("title", "from-peer")
    localFresh.applyOps(peer.encodeState())
    //    Equal clocks (one write each), so the actor id breaks the tie and
    //    "z9" > "a1" wins — the same rule the flat-API test asserts, reached
    //    through the handle.
    check(localRoom.get("title") == PyreonScalar.Str("from-peer"), "handle reads a merged remote write")

    tA.dispose()
    tB.dispose()
}
