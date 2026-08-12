// PyreonA11y smoke — the registered-announcer seam: announce() routes to the
// wired announcer, and is a no-op before one is set (Android has no
// context-free announcement channel).

package com.pyreon.runtime

private fun check(cond: Boolean, msg: String) {
    if (!cond) throw AssertionError(msg)
}

fun main() {
    val heard = mutableListOf<String>()

    // Before wiring: announce is a no-op (does not crash).
    PyreonA11y.announce("ignored")
    check(heard.isEmpty(), "announce before setAnnouncer must be a no-op")

    // After wiring: the announcer receives the message.
    PyreonA11y.setAnnouncer { heard.add(it) }
    PyreonA11y.announce("Saved")
    PyreonA11y.announce("Error", assertive = true)
    check(heard == listOf("Saved", "Error"), "announcer must receive each message in order")

    println("[PyreonA11yTest] all smoke tests passed")
}
