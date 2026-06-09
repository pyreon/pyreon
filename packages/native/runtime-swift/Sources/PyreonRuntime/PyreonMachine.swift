// PyreonMachine — SwiftUI side of @pyreon/machine's reactive state-machine
// surface. Mirrors the core `createMachine({ initial, states })` shape:
//
//     machine()                  // read current state ('idle', 'loading', …)
//     machine.send("FETCH")      // dispatch transition
//     machine.matches("loading") // boolean state check
//     machine.can("FETCH")       // boolean event-availability check
//     machine.nextEvents()       // [String] of valid events from current state
//
// and the Kotlin `PyreonMachine` one-for-one so iOS + Android stay in
// lockstep.
//
// ## What this delivers
//
// An `@Observable` container holding the reactive state value PLUS a
// `[State: [Event: NextState]]` transitions map. The transitions are
// captured at construction (passed through by the PMTC parser from the
// `createMachine({ initial, states })` literal config). The container
// owns the state-machine semantics; the SwiftUI view binds a label /
// conditional render to `machine()` or `machine.matches(...)` and re-
// renders as the state changes, exactly like the web `machine` signal.
//
// ## `callAsFunction()` — the m() ↔ signal-read parity
//
// Web `@pyreon/machine` exposes `machine()` as the read-current-state
// API (same as a signal call). PMTC needs `m()` in the source to mean
// `m.state` in emitted Swift. Implementing `callAsFunction()` on the
// container lets the SAME `m()` syntax work: the SwiftUI view writes
// `Text(machine())` and Swift invokes `callAsFunction()` which returns
// `state` — same byte semantics as web. No compiler-side rewriting
// needed.
//
// ## Scope — string-keyed state container (foundation)
//
// v1 stores states + events as `String` (matches the literal-config
// shape PMTC parses from `{ initial: 'idle' as const, states: { idle: …}}`).
// Typed enums + guards + entry/exit callbacks are deliberate follow-ups —
// this PR closes the silent-drop bug class for the dominant string-config
// shape; advanced features layer on top in subsequent PRs.

import Foundation
import Observation

/// Observable state-machine container — the SwiftUI half of
/// `createMachine({ initial, states })`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonMachine {
    /// Current state value. Mutates only via `send(_:)`.
    public private(set) var state: String

    /// Transition table — `state → event → nextState`. Immutable after
    /// construction; PMTC bakes the literal config in at emit time.
    public let transitions: [String: [String: String]]

    public init(initial: String, transitions: [String: [String: String]]) {
        self.state = initial
        self.transitions = transitions
    }

    /// Dispatch an event. If the current state defines a transition for
    /// the event, mutate `state` to the next; otherwise no-op (matches
    /// web `@pyreon/machine` semantics — invalid transitions are silently
    /// ignored, not thrown).
    public func send(_ event: String) {
        if let next = transitions[state]?[event] {
            state = next
        }
    }

    /// `m.matches("loading")` — boolean state check.
    public func matches(_ s: String) -> Bool {
        state == s
    }

    /// `m.can("FETCH")` — does the current state define a transition for
    /// this event?
    public func can(_ event: String) -> Bool {
        transitions[state]?[event] != nil
    }

    /// `m.nextEvents()` — valid events from the current state, in no
    /// guaranteed order (matches `Dictionary.keys` semantics).
    public func nextEvents() -> [String] {
        Array(transitions[state]?.keys ?? [:].keys)
    }

    /// `m()` — read current state. The `callAsFunction()` trick lets
    /// PMTC emit `m()` identically to a signal call without any
    /// compiler-side member-access rewriting.
    public func callAsFunction() -> String {
        state
    }
}

