// PyreonCrdt convergence + wire-compat assertions — one standalone program the
// co-source verify gate compiles with ../swift/PyreonCrdt.swift (-parse-as-library)
// and runs. Byte-aligned with the .kt test + the web pyreon-adapter tests: the
// SAME `{ops}` wire format + the SAME LWW merge, so an iOS peer converges with a
// web and an Android peer.

import Foundation

@main
struct PyreonCrdtTests {
    static func check(_ c: Bool, _ m: String) {
        if !c { fatalError("PyreonCrdtTests: \(m)") }
    }

    static func main() {
        // 1. Concurrent offline writes converge to the deterministic winner
        //    (higher actor wins an equal-clock tie).
        let a = PyreonCrdtDoc(actor: "a1")
        let b = PyreonCrdtDoc(actor: "z9")
        a.set("doc", "title", .string("from-A"))
        b.set("doc", "title", .string("from-B"))
        b.applyOps(a.encodeState())
        a.applyOps(b.encodeState())
        check(a.get("doc", "title") == .string("from-B"), "A converges to from-B")
        check(b.get("doc", "title") == .string("from-B"), "B converges to from-B")

        // 2. Higher clock wins regardless of actor.
        let c = PyreonCrdtDoc(actor: "z9")
        let d = PyreonCrdtDoc(actor: "a1")
        c.set("m", "k", .string("first"))
        d.applyOps(c.encodeState())
        d.set("m", "k", .string("second"))
        c.applyOps(d.encodeState())
        check(c.get("m", "k") == .string("second"), "higher clock wins")

        // 3. Wire round-trip in the exact web/JS format.
        let e = PyreonCrdtDoc(actor: "e1")
        let f = PyreonCrdtDoc(actor: "f1")
        var relayed = ""
        e.onLocalOps = { ops in relayed = e.encodeMessage(ops) }
        e.set("m", "n", .int(42))
        check(relayed.contains("\"ops\""), "message has ops")
        check(relayed.contains("\"value\":42"), "message has scalar 42")
        f.applyMessage(relayed)
        check(f.get("m", "n") == .int(42), "peer merged the wire message")

        // 4. Decode a message in the exact web/JS format (cross-engine).
        let g = PyreonCrdtDoc(actor: "g1")
        g.applyMessage(
            "{\"ops\":[{\"map\":\"doc\",\"key\":\"t\",\"value\":\"from-web\",\"clock\":5,\"actor\":\"web-peer\"}]}"
        )
        check(g.get("doc", "t") == .string("from-web"), "decodes a web-format message")

        // 5. Malformed is ignored.
        g.applyMessage("not json{")
        check(g.get("doc", "t") == .string("from-web"), "malformed ignored")

        // 6. PyreonSyncedSignal — the Signal<T> facade over a shared doc.
        if #available(iOS 17.0, macOS 14.0, *) {
            let doc = PyreonCrdtDoc(actor: "sig")
            let title = PyreonSyncedSignal<String>(doc: doc, key: "title", initial: "")
            check(title() == "", "synced signal reads its initial when absent")
            title.set("Roadmap")
            check(title() == "Roadmap", "set updates the value")
            check(doc.get(PYREON_SYNCED_DEFAULT_MAP, "title") == .string("Roadmap"), "set writes one CRDT op")

            // A SECOND signal on the same doc+key sees the present value win
            // (create-if-missing: the existing CRDT value, not `initial`).
            let title2 = PyreonSyncedSignal<String>(doc: doc, key: "title", initial: "IGNORED")
            check(title2() == "Roadmap", "a present key wins over a second signal's initial")

            // Independent keys; a numeric (Double) signal.
            let count = PyreonSyncedSignal<Double>(doc: doc, key: "count", initial: 0)
            check(count() == 0, "numeric signal initial")
            count.set(5)
            check(count() == 5, "numeric set")
            check(title() == "Roadmap", "sibling key unaffected")

            // A boolean signal.
            let done = PyreonSyncedSignal<Bool>(doc: doc, key: "done", initial: false)
            done.set(true)
            check(done(), "boolean set")

            // 7. A REMOTE op updates the signal's value via the doc observer —
            //    the CRDT-backed reactivity that makes a remote edit repaint the
            //    UI with no diff. Peer B catches up, writes a newer op, A merges,
            //    and A's signal flips (a higher clock wins the register).
            let remote = PyreonCrdtDoc(actor: "b2")
            remote.applyOps(doc.encodeState()) // catch up to A's clock
            remote.set(PYREON_SYNCED_DEFAULT_MAP, "title", .string("from-remote")) // newer op
            doc.applyOps(remote.encodeState())
            check(title() == "from-remote", "a remote op updates the signal via the doc observer")

            title.dispose() // idempotent; detaches the observer
            title.dispose()
        }

        // 8. PyreonSyncTransport — the native equivalent of the web
        //    `connectPyreonSync(doc, channel)`, proven device-free over an
        //    in-memory relay.
        PyreonSyncTransportTests.run()

        // 9. Create-if-missing DEFAULTS map (web #2519) — a default can never clobber
        //    real data on an actor tie-break.
        if #available(iOS 17.0, macOS 14.0, *) {
            PyreonSyncDefaultsTests.run()
        }

        print("[PyreonCrdtTests] all assertions passed")
    }
}

/// An in-memory string-duplex the two transports share — the device-free proof.
/// `send` counts + forwards to the peer (when live); `deliver` invokes the inbound
/// handler directly (models a frame arriving); `fireOpen` invokes the stored open
/// callback (models the channel becoming ready).
private final class TransportMemoryChannel: PyreonSyncChannel {
    weak var peer: TransportMemoryChannel?
    private var onMsg: ((String) -> Void)?
    private var onOpenCb: (() -> Void)?
    private var live = true
    var sendCount = 0
    func send(_ d: String) { sendCount += 1; if live { peer?.deliver(d) } }
    func deliver(_ d: String) { onMsg?(d) }
    func onMessage(_ cb: @escaping (String) -> Void) { onMsg = cb }
    func onOpen(_ cb: @escaping () -> Void) { onOpenCb = cb }
    func close() { live = false }
    func fireOpen() { onOpenCb?() }
}

/// Non-`@main` helper (the test binary already has one `@main` in PyreonCrdtTests).
/// Called from `PyreonCrdtTests.main()`.
enum PyreonSyncTransportTests {
    static func check(_ c: Bool, _ m: String) {
        if !c { fatalError("PyreonSyncTransportTests: \(m)") }
    }

    static func run() {
        // 1. Initial full-state on open: a pre-connect write reaches the peer.
        let docA = PyreonCrdtDoc(actor: "a1")
        let docB = PyreonCrdtDoc(actor: "z9") // distinct actorIds
        docA.set("m", "k", .string("pre")) // offline — no transport yet, so no relay
        let chA = TransportMemoryChannel()
        let chB = TransportMemoryChannel()
        chA.peer = chB
        chB.peer = chA
        let tA = PyreonSyncTransport(doc: docA, channel: chA)
        let tB = PyreonSyncTransport(doc: docB, channel: chB)
        chA.fireOpen() // A → B: full state
        chB.fireOpen() // B → A: full state
        check(docB.get("m", "k") == .string("pre"), "pre-connect state reaches B on open")

        // 2. Live convergence both directions.
        docA.set("m", "live1", .string("v1"))
        check(docB.get("m", "live1") == .string("v1"), "A→B live op")
        docB.set("m", "live2", .string("v2"))
        check(docA.get("m", "live2") == .string("v2"), "B→A live op")

        // 3. Concurrent-offline convergence to the deterministic LWW winner
        //    (both clock 1 → equal-clock tie broken by the higher actor).
        let docC = PyreonCrdtDoc(actor: "a1")
        let docD = PyreonCrdtDoc(actor: "z9")
        docC.set("doc", "title", .string("from-C"))
        docD.set("doc", "title", .string("from-D"))
        let chC = TransportMemoryChannel()
        let chD = TransportMemoryChannel()
        chC.peer = chD
        chD.peer = chC
        let tC = PyreonSyncTransport(doc: docC, channel: chC)
        // Retain tD: an unretained transport deallocates immediately and its
        // deinit → dispose() would nil docD.onLocalOps + close chD (a transport
        // is held for the connection's lifetime).
        let tD = PyreonSyncTransport(doc: docD, channel: chD)
        chC.fireOpen()
        chD.fireOpen()
        check(docC.get("doc", "title") == .string("from-D"), "C converges to LWW winner from-D")
        check(docD.get("doc", "title") == .string("from-D"), "D stays LWW winner from-D")

        // 4. Loop-prevention LOCK: an applied remote op is NOT re-broadcast.
        //    (Structural — applyMessage fires observers but emits no onLocalOps.)
        chC.sendCount = 0
        docD.set("doc", "note", .string("hi")) // D → C, C merges via applyMessage
        check(docC.get("doc", "note") == .string("hi"), "remote op merged on C")
        check(chC.sendCount == 0, "C did NOT echo the applied remote op")

        // 5. dispose isolation: post-dispose local writes stop relaying, but the
        //    SHARED doc survives (get still works).
        tC.dispose()
        docC.set("doc", "after", .string("afterval"))
        check(docD.get("doc", "after") == nil, "post-dispose write does not reach the peer")
        check(docC.get("doc", "after") == .string("afterval"), "shared doc survives dispose")
        tC.dispose() // idempotent — no crash

        // 6. Malformed inbound is ignored (no throw, state uncorrupted).
        let titleBefore = docD.get("doc", "title")
        chD.deliver("not json{")
        check(docD.get("doc", "title") == titleBefore, "malformed inbound ignored, state uncorrupted")

        _ = tA
        _ = tB
        _ = tD
    }
}

/// Non-`@main` helper. The create-if-missing SEED lands in a SEPARATE
/// `"<map>:defaults"` map (web #2519), so a fresh peer's default can never clobber
/// real data — reads prefer the real map. Called from `PyreonCrdtTests.main()`.
@available(iOS 17.0, macOS 14.0, *)
enum PyreonSyncDefaultsTests {
    static func check(_ c: Bool, _ m: String) {
        if !c { fatalError("PyreonSyncDefaultsTests: \(m)") }
    }

    static let defaultsMap = "\(PYREON_SYNCED_DEFAULT_MAP)\(PYREON_SYNCED_DEFAULTS_SUFFIX)"

    static func run() {
        // 1. CLOBBER-FIXED convergence. Two fresh docs (distinct actors) each seed
        //    their OWN default OFFLINE — the fresh-peer race — then connect.
        let docA = PyreonCrdtDoc(actor: "aaa")
        let docB = PyreonCrdtDoc(actor: "zzz")
        let sigA = PyreonSyncedSignal<String>(doc: docA, key: "title", initial: "A-default")
        let sigB = PyreonSyncedSignal<String>(doc: docB, key: "title", initial: "B-default")
        // The seeds live only in each doc's DEFAULTS map; the REAL map is empty.
        check(docA.get(PYREON_SYNCED_DEFAULT_MAP, "title") == nil, "seed did not touch A's real map")
        check(docB.get(PYREON_SYNCED_DEFAULT_MAP, "title") == nil, "seed did not touch B's real map")
        check(docA.get(defaultsMap, "title") == .string("A-default"), "A seeded its defaults map")

        // Connect + open → full-state exchange; the two concurrent defaults tie-break.
        let chA = TransportMemoryChannel()
        let chB = TransportMemoryChannel()
        chA.peer = chB
        chB.peer = chA
        let tA = PyreonSyncTransport(doc: docA, channel: chA)
        let tB = PyreonSyncTransport(doc: docB, channel: chB)
        chA.fireOpen()
        chB.fireOpen()

        // Converge on ONE default (harmless tie among defaults), NOT diverge — and
        // no default ever leaked into the real map.
        check(sigA() == sigB(), "both signals converge on the same default")
        check(sigA() == "A-default" || sigA() == "B-default", "the converged value is one of the defaults")
        check(docA.get(defaultsMap, "title") == docB.get(defaultsMap, "title"), "defaults maps converged")
        check(docA.get(PYREON_SYNCED_DEFAULT_MAP, "title") == nil, "no default leaked into A's real map")
        check(docB.get(PYREON_SYNCED_DEFAULT_MAP, "title") == nil, "no default leaked into B's real map")

        // A REAL write now OUTRANKS any default on BOTH peers — the #2519 guarantee.
        sigA.set("real")
        check(sigA() == "real", "A reads its real write")
        check(sigB() == "real", "B converges to the real value — a default never outranks it")
        check(docB.get(PYREON_SYNCED_DEFAULT_MAP, "title") == .string("real"), "real value in B's real map")

        // 2. NO-TRANSPORT: the seed is immediate (into the defaults map); a later
        //    `set` writes the real map, which the read then follows.
        let solo = PyreonCrdtDoc(actor: "solo")
        let s = PyreonSyncedSignal<String>(doc: solo, key: "k", initial: "seed")
        check(s() == "seed", "reads initial via the defaults resolve (no transport)")
        check(solo.get(PYREON_SYNCED_DEFAULT_MAP, "k") == nil, "initial seeded the defaults map, not the real map")
        check(solo.get(defaultsMap, "k") == .string("seed"), "initial present in the defaults map")
        s.set("v")
        check(s() == "v", "read follows the real write")
        check(solo.get(PYREON_SYNCED_DEFAULT_MAP, "k") == .string("v"), "set wrote the real map")

        // 3. PRESENT-KEY-WINS: a pre-set REAL value beats `initial` (real precedence),
        //    and no default is seeded when a real value already exists.
        let pre = PyreonCrdtDoc(actor: "pre")
        pre.set(PYREON_SYNCED_DEFAULT_MAP, "k", .string("present"))
        let sPre = PyreonSyncedSignal<String>(doc: pre, key: "k", initial: "IGNORED")
        check(sPre() == "present", "a present real value wins over initial")
        check(pre.get(defaultsMap, "k") == nil, "no default seeded when a real value exists")

        // 4. DISPOSE SAFETY: dispose before any observe fires → later writes are
        //    ignored, no crash. dispose is idempotent.
        let dd = PyreonCrdtDoc(actor: "disp")
        let sd = PyreonSyncedSignal<String>(doc: dd, key: "k", initial: "x")
        sd.dispose()
        sd.dispose() // idempotent
        dd.set(PYREON_SYNCED_DEFAULT_MAP, "k", .string("after"))
        check(sd() == "x", "a disposed signal ignores later writes, no crash")

        // 5. MAP HANDLE — the native twin of the web `doc.getMap(name)`.
        //    The engine's own methods take the map name as a first argument;
        //    shared source is written against the web API, where a map is a
        //    value you hold. Before this handle existed, the ordinary shape
        //    `doc.getMap('room').set('k', v)` lowered to native code calling a
        //    `getMap` that was not there — and PMTC emitted it verbatim with no
        //    warning, so the failure surfaced as a swiftc error in a generated
        //    file instead of a diagnostic naming the call.
        let hd = PyreonCrdtDoc(actor: "h1")
        let room = hd.getMap("room")

        //    The overloads are the other half: `PyreonScalar` is an enum, so
        //    `room.set("k", "v")` cannot type-check against a bare enum
        //    parameter, and requiring `.string("v")` would put a Swift enum case
        //    in a file that must also compile as TypeScript.
        room.set("title", "hello")
        room.set("n", 42)
        room.set("ok", true)
        room.set("ratio", 1.5)
        check(room.get("title") == .string("hello"), "handle set/get round-trips a String")
        check(room.get("n") == .int(42), "handle set/get round-trips an Int")
        check(room.get("ok") == .bool(true), "handle set/get round-trips a Bool")
        check(room.get("ratio") == .double(1.5), "handle set/get round-trips a Double")
        check(room.has("title"), "handle has")
        check(room.keys().count == 4, "handle keys")
        check(room.get("absent") == nil, "handle get of an absent key is nil")

        //    A handle is a VALUE, not a registration: two calls with the same
        //    name address the same underlying map.
        check(hd.getMap("room").get("title") == .string("hello"), "handles are not per-call state")
        check(hd.getMap("other").get("title") == nil, "a different name is a different map")

        //    And the handle observes only its OWN map.
        var sawRoom = 0
        var sawOther = 0
        let offRoom = room.observe { _ in sawRoom += 1 }
        let offOther = hd.getMap("other").observe { _ in sawOther += 1 }
        room.set("title", "changed")
        check(sawRoom == 1, "handle observe fires for its own map")
        check(sawOther == 0, "handle observe does not fire for another map")
        offRoom()
        offOther()
        room.set("title", "again")
        check(sawRoom == 1, "handle observe unsubscribes")

        //    Cross-document convergence THROUGH the handle — the shape a device
        //    proof drives: a peer writes, the local doc merges, the handle reads
        //    the merged value.
        //
        //    A FRESH pair, deliberately. Reusing `hd` here asserts nothing about
        //    the handle: `hd` has taken six writes above, so its Lamport clock is
        //    at 6 and a peer's clock-1 write correctly LOSES. The first draft of
        //    this test did exactly that and failed — the engine was right and the
        //    assertion was wrong, which is the more useful way round to find out.
        let localFresh = PyreonCrdtDoc(actor: "a1")
        let peer = PyreonCrdtDoc(actor: "z9")
        let localRoom = localFresh.getMap("room")
        localRoom.set("title", "from-local")
        peer.getMap("room").set("title", "from-peer")
        localFresh.applyOps(peer.encodeState())
        //    Equal clocks (one write each), so the actor id breaks the tie and
        //    "z9" > "a1" wins — the same rule the flat-API test at the top of
        //    this file asserts, reached through the handle.
        check(localRoom.get("title") == .string("from-peer"), "handle reads a merged remote write")

        _ = tA
        _ = tB
    }
}
