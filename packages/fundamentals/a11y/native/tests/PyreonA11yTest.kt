// PyreonA11y smoke — the announcer registry: announce() routes the message and
// its politeness to the most recently added live announcer, is a no-op with
// none, and removal is by identity so hosts can be disposed in any order.

package com.pyreon.runtime

private fun check(cond: Boolean, msg: String) {
    if (!cond) throw AssertionError(msg)
}

fun main() {
    // Before any host: announce is a no-op (does not crash).
    PyreonA11y.announce("ignored")

    val outer = mutableListOf<Pair<String, Boolean>>()
    val outerFn: (String, Boolean) -> Unit = { m, a -> outer.add(m to a) }
    PyreonA11y.addAnnouncer(outerFn)
    PyreonA11y.announce("Saved")
    PyreonA11y.announce("Error", assertive = true)
    check(outer == listOf("Saved" to false, "Error" to true), "the announcer must receive each message with its politeness, got $outer")

    // A nested host takes over while it is composed.
    val inner = mutableListOf<Pair<String, Boolean>>()
    val innerFn: (String, Boolean) -> Unit = { m, a -> inner.add(m to a) }
    PyreonA11y.addAnnouncer(innerFn)
    PyreonA11y.announce("Nested")
    check(inner == listOf("Nested" to false), "the most recently added announcer must receive the message, got $inner")
    check(outer.size == 2, "the outer announcer must not also receive it")

    // Disposing the OUTER host first must not unregister the inner one —
    // a position-based pop would remove the wrong announcer here.
    PyreonA11y.removeAnnouncer(outerFn)
    PyreonA11y.announce("Still inner")
    check(inner.last() == ("Still inner" to false), "removing the outer announcer must leave the inner one active")

    PyreonA11y.removeAnnouncer(innerFn)
    PyreonA11y.announce("ignored again")
    check(inner.size == 2 && outer.size == 2, "with every announcer removed, announce must be a no-op")

    println("[PyreonA11yTest] all smoke tests passed")
}
