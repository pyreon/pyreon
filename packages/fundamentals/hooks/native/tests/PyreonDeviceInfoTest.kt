// Executable checks for PyreonDeviceInfo — mirror of
// PyreonDeviceInfoTests.swift. The probe is a fake, so these run with no
// Android SDK and no device. What is under test is the READ-THROUGH contract:
// `screen` is a getter, not a value captured at construction.

package com.pyreon.runtime

private class FakeDeviceProbe(
    override var model: String = "Pixel 9",
    override var osVersion: String = "15",
    override var isTouch: Boolean = true,
    override var screen: PyreonDeviceScreen = PyreonDeviceScreen(412.0, 915.0, 2.625),
) : DeviceProbe

private fun expect(cond: Boolean, what: String) {
    if (!cond) {
        System.err.println("FAIL: $what")
        kotlin.system.exitProcess(1)
    }
}

private fun reportsTheProbesValues() {
    val info = PyreonDeviceInfo(FakeDeviceProbe())
    expect(info.model == "Pixel 9", "model")
    expect(info.osVersion == "15", "osVersion")
    expect(info.isTouch, "isTouch")
    expect(info.screen.width == 412.0, "screen width")
    expect(info.screen.scale == 2.625, "screen scale")
}

private fun platformIsCompileTimeConstant() {
    // The web arm returns 'web' and the Swift one 'ios'; this is the one
    // field that needs no probe on any target.
    expect(PyreonDeviceInfo(FakeDeviceProbe()).platform == "android", "platform")
}

private fun screenReadsThrough() {
    val probe = FakeDeviceProbe()
    val info = PyreonDeviceInfo(probe)
    expect(info.screen.width == 412.0, "initial width")

    // A fold or a rotation moves this while the app is live. Caching at
    // construction would keep reporting the old geometry — the bug this
    // property shape exists to prevent.
    probe.screen = PyreonDeviceScreen(915.0, 412.0, 2.625)
    expect(info.screen.width == 915.0, "width AFTER the geometry changed")
    expect(info.screen.height == 412.0, "height AFTER the geometry changed")
}

public fun main() {
    reportsTheProbesValues()
    platformIsCompileTimeConstant()
    screenReadsThrough()
    println("PyreonDeviceInfoTest: ok")
}
