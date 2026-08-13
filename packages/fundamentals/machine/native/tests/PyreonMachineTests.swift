// PyreonMachine behaviour assertions (iOS side) — one standalone program the
// co-source verify gate compiles with ../swift/PyreonMachine.swift
// (-parse-as-library) and RUNS on a full-SDK host (macOS/Observation). Byte-
// aligned with PyreonMachineTest.kt and the web `@pyreon/machine` semantics:
// the SAME transition table drives the SAME state sequence, so an iOS machine
// steps identically to an Android and a web one.
//
// Requires Observation (the port is `@Observable`, iOS 17 / macOS 14), so the
// gate only runs this where the full Swift SDK is present — the same host the
// port itself is compiled on.

import Foundation

@available(iOS 17.0, macOS 14.0, *)
@main
struct PyreonMachineTests {
    static func check(_ c: Bool, _ m: String) {
        if !c { fatalError("PyreonMachineTests: \(m)") }
    }

    // A fetch machine: idle -FETCH-> loading; loading -RESOLVE-> success,
    // loading -REJECT-> failure; success/failure -RESET-> idle.
    static let transitions: [String: [String: String]] = [
        "idle": ["FETCH": "loading"],
        "loading": ["RESOLVE": "success", "REJECT": "failure"],
        "success": ["RESET": "idle"],
        "failure": ["RESET": "idle"],
    ]

    static func main() {
        let m = PyreonMachine(initial: "idle", transitions: transitions)

        // 1. Initial state, and m() ↔ state parity (the callAsFunction trick).
        check(m.state == "idle", "initial state is idle")
        check(m() == "idle", "m() reads the current state")
        check(m.matches("idle"), "matches(idle) true at start")
        check(!m.matches("loading"), "matches(loading) false at start")

        // 2. can() reflects the transition table for the current state.
        check(m.can("FETCH"), "can(FETCH) from idle")
        check(!m.can("RESOLVE"), "cannot RESOLVE from idle")

        // 3. nextEvents() — order-independent (Dictionary.keys), so compare Sets.
        check(Set(m.nextEvents()) == Set(["FETCH"]), "nextEvents from idle == {FETCH}")

        // 4. A valid transition mutates state.
        m.send("FETCH")
        check(m.state == "loading", "FETCH → loading")
        check(m() == "loading", "m() tracks the mutation")
        check(Set(m.nextEvents()) == Set(["RESOLVE", "REJECT"]), "loading offers RESOLVE+REJECT")

        // 5. An INVALID event is a silent no-op (matches web @pyreon/machine —
        //    invalid transitions are ignored, never thrown).
        m.send("FETCH") // no FETCH transition from loading
        check(m.state == "loading", "invalid event from loading is a no-op")
        m.send("NOPE") // wholly unknown event
        check(m.state == "loading", "unknown event is a no-op")

        // 6. Branch to a terminal-ish state and cycle back via RESET.
        m.send("RESOLVE")
        check(m.state == "success", "RESOLVE → success")
        check(m.matches("success"), "matches(success)")
        check(m.can("RESET") && !m.can("FETCH"), "success offers only RESET")
        m.send("RESET")
        check(m.state == "idle", "RESET → idle (full cycle)")

        // 7. The other branch, from a fresh machine.
        let n = PyreonMachine(initial: "idle", transitions: transitions)
        n.send("FETCH")
        n.send("REJECT")
        check(n.state == "failure", "FETCH,REJECT → failure")
        check(Set(n.nextEvents()) == Set(["RESET"]), "failure offers only RESET")

        print("PyreonMachineTests: all assertions passed")
    }
}
