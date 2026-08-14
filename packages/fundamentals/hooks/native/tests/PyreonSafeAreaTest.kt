// Executable checks for PyreonSafeArea + PyreonScreenOrientation — mirror of
// PyreonSafeAreaTests.swift. The probes are fakes, so these run with no
// Android SDK. What is under test is the READ-THROUGH contract.

package com.pyreon.runtime

private class FakeSafeAreaProbe(
    override var insets: PyreonSafeAreaInsets = PyreonSafeAreaInsets(24.0, 0.0, 48.0, 0.0),
) : SafeAreaProbe

private class FakeOrientationProbe(
    override var type: String = "portrait",
    override var angle: Int = 0,
) : OrientationProbe

private fun expect(cond: Boolean, what: String) {
    if (!cond) {
        System.err.println("FAIL: $what")
        kotlin.system.exitProcess(1)
    }
}

private fun reportsInsets() {
    val sa = PyreonSafeArea(FakeSafeAreaProbe())
    // Status bar above, gesture bar below.
    expect(sa.insets.top == 24.0, "top")
    expect(sa.insets.bottom == 48.0, "bottom")
    expect(sa.insets.left == 0.0, "left")
}

private fun insetsReadThrough() {
    val probe = FakeSafeAreaProbe()
    val sa = PyreonSafeArea(probe)
    expect(sa.insets.top == 24.0, "initial top")

    // Rotating moves the insets to the sides. Caching at construction would
    // keep reporting the portrait values and content would draw under the
    // cutout — the bug this hook exists to prevent.
    probe.insets = PyreonSafeAreaInsets(0.0, 24.0, 48.0, 24.0)
    expect(sa.insets.top == 0.0, "top AFTER rotation")
    expect(sa.insets.left == 24.0, "left AFTER rotation")
}

private fun reportsOrientation() {
    val o = PyreonScreenOrientation(FakeOrientationProbe())
    expect(o.type == "portrait", "type")
    expect(o.angle == 0, "angle")
}

private fun orientationReadsThrough() {
    val probe = FakeOrientationProbe()
    val o = PyreonScreenOrientation(probe)
    probe.type = "landscape"
    probe.angle = 90
    expect(o.type == "landscape", "type AFTER rotation")
    expect(o.angle == 90, "angle AFTER rotation")
}

public fun main() {
    reportsInsets()
    insetsReadThrough()
    reportsOrientation()
    orientationReadsThrough()
    println("PyreonSafeAreaTest: ok")
}
