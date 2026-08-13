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

        print("[PyreonCrdtTests] all assertions passed")
    }
}
