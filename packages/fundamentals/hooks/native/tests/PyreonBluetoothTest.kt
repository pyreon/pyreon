// Smoke tests for PyreonBluetooth — mirror of PyreonBluetoothTests.swift.
// Dependency-free `check(...)` harness.

package com.pyreon.runtime

private class FakeScanner(override val isAvailable: Boolean = true) : BluetoothScanner {
    var stopped = 0
    private var emit: ((PyreonBluetoothDevice) -> Unit)? = null
    private var fail: ((String) -> Unit)? = null

    override fun startScan(onDevice: (PyreonBluetoothDevice) -> Unit, onError: (String) -> Unit) {
        emit = onDevice
        fail = onError
    }
    override fun stopScan() { stopped++ }
    fun found(id: String, name: String) { emit?.invoke(PyreonBluetoothDevice(id, name)) }
    fun error(m: String) { fail?.invoke(m) }
}

fun testBluetoothDiscoveryOrder() {
    val s = FakeScanner()
    val bt = PyreonBluetooth(s)
    check(bt.available) { "available reflects the scanner" }
    bt.scan()
    check(bt.scanning.value) { "scanning is true during a scan" }
    s.found("b", "Beta")
    s.found("a", "Alpha")
    s.found("b", "Beta again")
    check(bt.devices.value.map { it.id } == listOf("b", "a")) { "first-seen order, deduped by id" }
    check(bt.devices.value[0].name == "Beta") { "the FIRST sighting's name wins" }
}

fun testBluetoothStopKeepsResults() {
    val s = FakeScanner()
    val bt = PyreonBluetooth(s)
    bt.scan()
    s.found("a", "Alpha")
    bt.stopScan()
    check(!bt.scanning.value) { "stopScan clears scanning" }
    check(bt.devices.value.size == 1) { "stopScan KEEPS discovered devices" }
    check(s.stopped == 1) { "the radio was stopped" }
    bt.stopScan()
    check(s.stopped == 1) { "a redundant stopScan does not re-stop the radio" }
}

fun testBluetoothRescanClears() {
    val s = FakeScanner()
    val bt = PyreonBluetooth(s)
    bt.scan()
    s.found("a", "Alpha")
    bt.scan()
    check(bt.devices.value.isEmpty()) { "scan() clears previous results" }
}

fun testBluetoothErrorIsState() {
    val s = FakeScanner()
    val bt = PyreonBluetooth(s)
    bt.scan()
    s.error("permission denied")
    check(bt.error.value == "permission denied") { "error surfaces as state" }
    check(!bt.scanning.value) { "an error ends the scan" }
}

fun testBluetoothUnavailable() {
    val bt = PyreonBluetooth(FakeScanner(isAvailable = false))
    bt.scan()
    check(!bt.scanning.value) { "an unavailable adapter does not start a scan" }
    check(bt.error.value.contains("not available")) { "…and says why" }
}

fun main() {
    testBluetoothDiscoveryOrder()
    testBluetoothStopKeepsResults()
    testBluetoothRescanClears()
    testBluetoothErrorIsState()
    testBluetoothUnavailable()
    println("[PyreonBluetoothTest] all assertions passed")
}
