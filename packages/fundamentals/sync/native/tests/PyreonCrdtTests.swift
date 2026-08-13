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

        print("[PyreonCrdtTests] all assertions passed")
    }
}
