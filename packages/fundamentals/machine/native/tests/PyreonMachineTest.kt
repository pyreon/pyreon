// PyreonMachine behaviour assertions (Android side). Byte-aligned with
// PyreonMachineTests.swift + the web `@pyreon/machine` semantics — the SAME
// transition table drives the SAME state sequence, so an Android machine steps
// identically to an iOS and a web one. Compiled against the Compose stub's real
// read/write `MutableState`, so `send()` mutations are observed.

import com.pyreon.runtime.PyreonMachine

private fun check(cond: Boolean, msg: String) {
    if (!cond) throw AssertionError("PyreonMachineTest: $msg")
}

// A fetch machine: idle -FETCH-> loading; loading -RESOLVE-> success,
// loading -REJECT-> failure; success/failure -RESET-> idle.
private val transitions: Map<String, Map<String, String>> = mapOf(
    "idle" to mapOf("FETCH" to "loading"),
    "loading" to mapOf("RESOLVE" to "success", "REJECT" to "failure"),
    "success" to mapOf("RESET" to "idle"),
    "failure" to mapOf("RESET" to "idle"),
)

fun main() {
    val m = PyreonMachine("idle", transitions)

    // 1. Initial state, and m() ↔ state parity (invoke() trick).
    check(m.state == "idle", "initial state is idle")
    check(m() == "idle", "m() reads the current state")
    check(m.matches("idle"), "matches(idle) true at start")
    check(!m.matches("loading"), "matches(loading) false at start")

    // 2. can() reflects the transition table for the current state.
    check(m.can("FETCH"), "can(FETCH) from idle")
    check(!m.can("RESOLVE"), "cannot RESOLVE from idle")

    // 3. nextEvents() — order-independent, so compare Sets.
    check(m.nextEvents().toSet() == setOf("FETCH"), "nextEvents from idle == {FETCH}")

    // 4. A valid transition mutates state.
    m.send("FETCH")
    check(m.state == "loading", "FETCH → loading")
    check(m() == "loading", "m() tracks the mutation")
    check(m.nextEvents().toSet() == setOf("RESOLVE", "REJECT"), "loading offers RESOLVE+REJECT")

    // 5. An INVALID event is a silent no-op (matches web @pyreon/machine).
    m.send("FETCH") // no FETCH transition from loading
    check(m.state == "loading", "invalid event from loading is a no-op")
    m.send("NOPE") // wholly unknown event
    check(m.state == "loading", "unknown event is a no-op")

    // 6. Branch to success and cycle back via RESET.
    m.send("RESOLVE")
    check(m.state == "success", "RESOLVE → success")
    check(m.matches("success"), "matches(success)")
    check(m.can("RESET") && !m.can("FETCH"), "success offers only RESET")
    m.send("RESET")
    check(m.state == "idle", "RESET → idle (full cycle)")

    // 7. The other branch, from a fresh machine.
    val n = PyreonMachine("idle", transitions)
    n.send("FETCH")
    n.send("REJECT")
    check(n.state == "failure", "FETCH,REJECT → failure")
    check(n.nextEvents().toSet() == setOf("RESET"), "failure offers only RESET")

    println("PyreonMachineTest: all assertions passed")
}
