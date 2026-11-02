// The phase contract every <Gesture> target keeps, pinned against the same
// numbers as the web GestureTracker's unit tests.

package com.pyreon.runtime

import kotlin.math.abs

private fun near(a: Double, b: Double) = abs(a - b) < 1e-9

fun main() {
    val pans = mutableListOf<PyreonPanEvent>()
    val pinches = mutableListOf<PyreonPinchEvent>()
    val rotations = mutableListOf<PyreonRotateEvent>()
    val t = PyreonGestureTracker(slop = 10.0)
    t.onPan = { pans += it }
    t.onPinch = { pinches += it }
    t.onRotate = { rotations += it }

    // Nothing until the slop is passed.
    check(!t.move(1, 10.0, 0.0, 1.0, 0.0, 10.0, 0.0, 0.0)) { "claimed inside the slop" }
    check(pans.isEmpty()) { "pan reported inside the slop: $pans" }
    check(t.move(1, 1.0, 0.0, 1.0, 0.0, 11.0, 0.0, 0.0)) { "not claimed past the slop" }
    check(pans.single() == PyreonPanEvent(11.0, 0.0, 11.0, 0.0, "start")) { "start: $pans" }

    // Cumulative changes; a single pointer never pinches or rotates.
    t.move(1, 0.0, 30.0, 1.5, 20.0, 11.0, 30.0, 0.0)
    check(pans.last() == PyreonPanEvent(11.0, 30.0, 11.0, 30.0, "change")) { "change: ${pans.last()}" }
    check(pinches.isEmpty() && rotations.isEmpty()) { "single pointer pinched/rotated" }

    // A second finger: pinch + rotate start, anchored at the centroid at that moment.
    t.move(2, 0.0, 0.0, 2.0, 15.0, 100.0, 50.0, 50.0)
    t.move(2, 0.0, 0.0, 1.5, 15.0, 120.0, 60.0, 75.0)
    check(pinches.map { it.phase } == listOf("start", "change")) { "pinch phases: $pinches" }
    check(near(pinches.last().scale, 3.0)) { "scale should be 2 × 1.5 = 3: ${pinches.last()}" }
    check(pinches.last().centerX == 100.0 && pinches.last().centerY == 50.0) { "anchor moved: ${pinches.last()}" }
    check(near(rotations.last().degrees, 30.0)) { "degrees: ${rotations.last()}" }

    // End: exactly once per started gesture, carrying the last values.
    t.finish()
    check(pans.last() == PyreonPanEvent(11.0, 30.0, 120.0, 60.0, "end")) { "pan end: ${pans.last()}" }
    check(pinches.last().phase == "end" && near(pinches.last().scale, 3.0)) { "pinch end: ${pinches.last()}" }
    check(rotations.last().phase == "end") { "rotate end: ${rotations.last()}" }
    val sizes = Triple(pans.size, pinches.size, rotations.size)
    t.finish()
    check(Triple(pans.size, pinches.size, rotations.size) == sizes) { "a second finish delivered events" }

    // The next gesture starts from zero.
    t.move(1, 0.0, 50.0, 1.0, 0.0, 0.0, 50.0, 0.0)
    check(pans.last() == PyreonPanEvent(0.0, 50.0, 0.0, 50.0, "start")) { "restart: ${pans.last()}" }
    t.finish()

    // A pure two-finger rotation (no pan, no zoom) still passes the slop:
    // 30 degrees at a 50dp spread is a 26dp arc.
    val r = mutableListOf<PyreonRotateEvent>()
    val t2 = PyreonGestureTracker(slop = 10.0)
    t2.onRotate = { r += it }
    check(t2.move(2, 0.0, 0.0, 1.0, 30.0, 0.0, 0.0, 50.0)) { "rotation did not pass the slop" }
    check(r.single().phase == "start" && near(r.single().degrees, 30.0)) { "rotation: $r" }

    // A gesture that never started finishes silently.
    val t3 = PyreonGestureTracker(slop = 10.0)
    var fired = false
    t3.onPan = { fired = true }
    t3.move(1, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0, 0.0)
    t3.finish()
    check(!fired) { "an unclaimed gesture delivered an event" }

    println("[PyreonGestureCoreTest] all smoke tests passed")
}
