// PyreonSortableState behaviour assertions (Android). The expected arrays are
// GROUND TRUTH taken from running @pyreon/dnd's own `performReorder`
// arithmetic (use-sortable.ts) over the same seed — not hand-derived — so this
// test and its Swift twin pin all three platforms to one reorder semantic.

import com.pyreon.runtime.PyreonDropEdge
import com.pyreon.runtime.PyreonSortAxis
import com.pyreon.runtime.PyreonSortableState

private fun check(cond: Boolean, msg: String) {
    if (!cond) throw AssertionError("PyreonSortableTest: $msg")
}

private class Harness(seed: List<String>) {
    var live: List<String> = seed
    val state = PyreonSortableState<String>()

    init {
        state.bind({ live }, { it }, { live = it })
    }
}

fun main() {
    val seed = listOf("a", "b", "c", "d")

    // ── 1. the four edge cases, against web ground truth ────────────────────
    val expectations = listOf(
        Triple("a", "c", PyreonDropEdge.BOTTOM) to listOf("b", "c", "a", "d"),
        Triple("d", "b", PyreonDropEdge.TOP) to listOf("a", "d", "b", "c"),
        Triple("a", "c", PyreonDropEdge.TOP) to listOf("b", "a", "c", "d"),
        Triple("d", "b", PyreonDropEdge.BOTTOM) to listOf("a", "b", "d", "c"),
        Triple("a", "b", PyreonDropEdge.TOP) to listOf("a", "b", "c", "d"),
        Triple("a", "d", PyreonDropEdge.BOTTOM) to listOf("b", "c", "d", "a"),
    )
    for ((input, want) in expectations) {
        val (drag, drop, edge) = input
        val got = Harness(seed).state.reordered(drag, drop, edge)
        check(got == want, "$drag->$drop@$edge = $got want $want")
    }

    // ── 2. no-op guards return null (web returns early) ─────────────────────
    val guards = Harness(seed).state
    check(guards.reordered("b", "b", PyreonDropEdge.TOP) == null, "same key is null")
    check(guards.reordered("zz", "a", PyreonDropEdge.TOP) == null, "missing drag is null")
    check(guards.reordered("a", "zz", PyreonDropEdge.TOP) == null, "missing drop is null")

    // ── 3. the DISPLACEMENT path (the Android gesture) lands on the same
    //      arrays the edge path produces ───────────────────────────────────
    val oneSlot = Harness(seed)
    oneSlot.state.pickUp("a")
    oneSlot.state.dragBy(40f, 40f)
    check(oneSlot.state.isOverKey("b"), "one slot down targets b, got ${oneSlot.state.overId()}")
    check(oneSlot.state.overEdge() == "bottom", "downward drag reads as a bottom edge string")
    check(oneSlot.state.activeId() == "a", "activeId() mirrors the web accessor")
    check(oneSlot.state.drop(), "a real move reports handled")
    check(oneSlot.live == listOf("b", "a", "c", "d"), "one slot down = ${oneSlot.live}")

    val twoSlots = Harness(seed)
    twoSlots.state.pickUp("a")
    twoSlots.state.dragBy(40f, 40f)
    twoSlots.state.dragBy(40f, 40f)
    check(twoSlots.state.isOverKey("c"), "two slots down targets c, got ${twoSlots.state.overId()}")
    check(twoSlots.state.drop(), "two-slot move reports handled")
    // Identical to the edge-path result for a->c@bottom above: the two gesture
    // models differ, the resulting array does not.
    check(twoSlots.live == listOf("b", "c", "a", "d"), "two slots down = ${twoSlots.live}")

    val upward = Harness(seed)
    upward.state.pickUp("d")
    upward.state.dragBy(-40f, 40f)
    check(upward.state.isOverKey("c"), "one slot up targets c")
    check(upward.state.overEdge() == "top", "upward drag reads as a top edge string")
    check(upward.state.drop(), "upward move reports handled")
    check(upward.live == listOf("a", "b", "d", "c"), "one slot up = ${upward.live}")

    // ── 4. sub-slot drags do NOT reorder, and report no target ──────────────
    val tiny = Harness(seed)
    tiny.state.pickUp("a")
    tiny.state.dragBy(6f, 40f)
    check(tiny.state.overId() == null, "a sub-slot drag has no target")
    check(!tiny.state.drop(), "a sub-slot drag is not a move")
    check(tiny.live == seed, "a sub-slot drag left the list alone")

    // A zero extent (a row measured before layout) must not divide — an
    // unguarded divide sends the slot delta to infinity and reorders the list
    // on the first pixel of movement.
    val unmeasured = Harness(seed)
    unmeasured.state.pickUp("a")
    unmeasured.state.dragBy(500f, 0f)
    check(unmeasured.state.overId() == null, "a zero extent yields no target")
    check(!unmeasured.state.drop(), "a zero extent is not a move")
    check(unmeasured.live == seed, "a zero extent left the list alone")

    // ── 5. drags past the ends clamp instead of throwing ────────────────────
    val past = Harness(seed)
    past.state.pickUp("a")
    past.state.dragBy(4000f, 40f)
    check(past.state.isOverKey("d"), "an overshoot clamps to the last row")
    check(past.state.drop(), "the clamped move commits")
    check(past.live == listOf("b", "c", "d", "a"), "overshoot = ${past.live}")

    // ── 6. lifecycle ───────────────────────────────────────────────────────
    val life = Harness(seed).state
    life.pickUp("a")
    check(life.isActive("a"), "isActive after pickUp")
    check(!life.isActive("b"), "isActive is per-key")
    life.cancel()
    check(life.activeId() == null, "cancel clears activeId")
    check(life.overId() == null, "cancel clears overId")
    // A cancel must also drop the accumulated distance, or the next pick-up
    // inherits it and jumps.
    life.pickUp("a")
    check(!life.drop(), "a fresh pick-up carries no accumulated drag")

    // ── 7. axis is carried ─────────────────────────────────────────────────
    val horizontal = PyreonSortableState<String>(PyreonSortAxis.HORIZONTAL)
    check(horizontal.axis == PyreonSortAxis.HORIZONTAL, "axis round-trips")

    println("PyreonSortableTest: OK")
}
