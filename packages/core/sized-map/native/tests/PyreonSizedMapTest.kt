// PyreonSizedMap smoke — the ONE-FOR-ONE mirror of PyreonSizedMapTests.swift.
//
// The eviction semantics are subtle (FIFO by default, LRU only on opt-in,
// `set` ALWAYS refreshing position), so "both platforms have a sized map" is
// worth nothing unless the same questions are asked of each.

package com.pyreon.runtime

private fun check(cond: Boolean, msg: String) {
    if (!cond) throw AssertionError("PyreonSizedMapTest: $msg")
}

fun main() {
    // ── FIFO (default): get does NOT rescue an entry from eviction ──
    val fifo = PyreonSizedMap<String, Int>(maxEntries = 2)
    fifo.set("a", 1)
    fifo.set("b", 2)
    check(fifo.get("a") == 1, "reads back")
    fifo.set("c", 3)
    check(!fifo.has("a"), "FIFO evicts the oldest INSERTED, reads do not rescue")
    check(fifo.has("b") && fifo.has("c"), "survivors kept")
    check(fifo.size == 2, "size stays at the cap")

    // ── LRU-on-read: the same sequence keeps "a" instead ──
    val lru = PyreonSizedMap<String, Int>(maxEntries = 2, lru = true)
    lru.set("a", 1)
    lru.set("b", 2)
    lru.get("a")
    lru.set("c", 3)
    check(lru.has("a"), "LRU: a read moves the entry to the tail")
    check(!lru.has("b"), "LRU: the least-recently-USED entry goes")

    // ── set() ALWAYS refreshes position, in BOTH modes ──
    val refresh = PyreonSizedMap<String, Int>(maxEntries = 2)
    refresh.set("a", 1)
    refresh.set("b", 2)
    refresh.set("a", 10)
    refresh.set("c", 3)
    check(refresh.has("a"), "a rewrite refreshes position even in FIFO mode")
    check(refresh.get("a") == 10, "the rewritten VALUE is kept")
    check(!refresh.has("b"), "b is now the oldest")

    // ── keys() is eviction order, oldest first ──
    val ordered = PyreonSizedMap<String, Int>(maxEntries = 3)
    ordered.set("x", 1)
    ordered.set("y", 2)
    ordered.set("z", 3)
    check(ordered.keys() == listOf("x", "y", "z"), "insertion order, oldest first")
    check(ordered.values() == listOf(1, 2, 3), "values follow the same order")

    // ── delete / clear ──
    check(ordered.delete("y"), "delete reports a hit")
    check(!ordered.delete("nope"), "delete reports a miss")
    check(ordered.keys() == listOf("x", "z"), "delete removes from the ORDER too")
    ordered.clear()
    check(ordered.size == 0 && ordered.keys().isEmpty(), "clear empties both")

    // ── a cap below 1 is floored, not honoured ──
    val floored = PyreonSizedMap<String, Int>(maxEntries = 0)
    floored.set("only", 1)
    check(floored.get("only") == 1, "cap floors at 1 rather than evicting the new entry")

    println("[PyreonSizedMapTest] ok")
}
