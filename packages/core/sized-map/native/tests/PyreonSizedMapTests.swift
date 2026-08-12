// PyreonSizedMap behaviour — a standalone assertion program the co-source
// verify gate compiles together with ../swift/PyreonSizedMap.swift
// (-parse-as-library) and RUNS. Not shipped; lives outside native/swift/.
//
// Every assertion below is mirrored, one for one, in PyreonSizedMapTest.kt.
// That is the point: the eviction semantics are subtle enough (FIFO by
// default, LRU only on opt-in, `set` ALWAYS refreshing position) that "both
// platforms have a sized map" is worth nothing without the same questions
// asked of each.

import Foundation

@main
struct PyreonSizedMapTests {
    static func check(_ cond: Bool, _ message: String) {
        if !cond { fatalError("PyreonSizedMapTests: \(message)") }
    }

    static func main() {
        // ── FIFO (default): get does NOT rescue an entry from eviction ──
        let fifo = PyreonSizedMap<String, Int>(maxEntries: 2)
        fifo.set("a", 1)
        fifo.set("b", 2)
        check(fifo.get("a") == 1, "reads back")
        // "a" was just READ, but FIFO ignores reads, so "a" is still oldest.
        fifo.set("c", 3)
        check(fifo.has("a") == false, "FIFO evicts the oldest INSERTED, reads do not rescue")
        check(fifo.has("b") && fifo.has("c"), "survivors kept")
        check(fifo.size == 2, "size stays at the cap")

        // ── LRU-on-read: the same sequence keeps "a" instead ──
        let lru = PyreonSizedMap<String, Int>(maxEntries: 2, lru: true)
        lru.set("a", 1)
        lru.set("b", 2)
        _ = lru.get("a")
        lru.set("c", 3)
        check(lru.has("a"), "LRU: a read moves the entry to the tail")
        check(lru.has("b") == false, "LRU: the least-recently-USED entry goes")

        // ── set() ALWAYS refreshes position, in BOTH modes ──
        // The bug this catches: writing a key and having it evicted on the
        // very next call because the write did not count as a recency hit.
        let refresh = PyreonSizedMap<String, Int>(maxEntries: 2)
        refresh.set("a", 1)
        refresh.set("b", 2)
        refresh.set("a", 10)
        refresh.set("c", 3)
        check(refresh.has("a"), "a rewrite refreshes position even in FIFO mode")
        check(refresh.get("a") == 10, "the rewritten VALUE is kept")
        check(refresh.has("b") == false, "b is now the oldest")

        // ── keys() is eviction order, oldest first ──
        let ordered = PyreonSizedMap<String, Int>(maxEntries: 3)
        ordered.set("x", 1)
        ordered.set("y", 2)
        ordered.set("z", 3)
        check(ordered.keys() == ["x", "y", "z"], "insertion order, oldest first")
        check(ordered.values() == [1, 2, 3], "values follow the same order")

        // ── delete / clear ──
        check(ordered.delete("y"), "delete reports a hit")
        check(ordered.delete("nope") == false, "delete reports a miss")
        check(ordered.keys() == ["x", "z"], "delete removes from the ORDER too, not just storage")
        ordered.clear()
        check(ordered.size == 0 && ordered.keys().isEmpty, "clear empties both")

        // ── a cap below 1 is floored, not honoured ──
        // maxEntries: 0 would make set() evict what it just wrote.
        let floored = PyreonSizedMap<String, Int>(maxEntries: 0)
        floored.set("only", 1)
        check(floored.get("only") == 1, "cap floors at 1 rather than evicting the new entry")

        print("[PyreonSizedMapTests] ok")
    }
}
