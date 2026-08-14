// PyreonBluetooth behaviour — a standalone assertion program the co-source
// verify gate compiles with ../swift/PyreonBluetooth.swift and RUNS.
// Byte-aligned with PyreonBluetoothTest.kt and the web useBluetooth tests.

import Foundation

final class FakeScanner: BluetoothScanner {
    var isAvailable: Bool
    var stopped = 0
    private var emit: ((PyreonBluetoothDevice) -> Void)?
    private var fail: ((String) -> Void)?

    init(available: Bool = true) { self.isAvailable = available }

    func startScan(onDevice: @escaping (PyreonBluetoothDevice) -> Void,
                   onError: @escaping (String) -> Void) {
        emit = onDevice
        fail = onError
    }
    func stopScan() { stopped += 1 }
    func found(_ id: String, _ name: String) { emit?(PyreonBluetoothDevice(id: id, name: name)) }
    func error(_ m: String) { fail?(m) }
}

@main
struct PyreonBluetoothTests {
    static func check(_ c: Bool, _ m: String) { if !c { fatalError("PyreonBluetoothTests: \(m)") } }

    static func main() {
        if #available(iOS 17.0, macOS 14.0, *) {
            run()
            // PyreonWakeLock is @Observable and therefore availability-gated,
            // so its suite runs inside this guard rather than beside the
            // ungated ones below.
            PyreonWakeLockTests.runAll()
            PyreonDeviceInfoTests.runAll()
            PyreonSafeAreaTests.runAll()
            PyreonAudioPlayerTests.runAll()
            PyreonAudioRecorderTests.runAll()
            PyreonCameraTests.runAll()
            PyreonSpeechTests.runAll()
        }
        print("[PyreonBluetoothTests] all assertions passed")
        // This directory's single @main also drives the sibling suites — see
        // PyreonRateLimitTests for why they cannot own their own entry point.
        PyreonRateLimitTests.runAll()
    }

    @available(iOS 17.0, macOS 14.0, *)
    static func run() {
        // Discovery keeps FIRST-SEEN order and dedupes by id. BLE peripherals
        // advertise continuously, so the duplicate is the common case.
        let s = FakeScanner()
        let bt = PyreonBluetooth(scanner: s)
        check(bt.available, "available reflects the scanner")
        bt.scan()
        check(bt.scanning, "scanning is true during a scan")
        s.found("b", "Beta")
        s.found("a", "Alpha")
        s.found("b", "Beta again")
        check(bt.devices.map(\.id) == ["b", "a"], "first-seen order, deduped by id")
        check(bt.devices[0].name == "Beta", "the FIRST sighting's name wins")

        // stopScan keeps results and stops the radio exactly once.
        bt.stopScan()
        check(!bt.scanning, "stopScan clears scanning")
        check(bt.devices.count == 2, "stopScan KEEPS discovered devices")
        check(s.stopped == 1, "the radio was stopped")
        bt.stopScan()
        check(s.stopped == 1, "a redundant stopScan does not re-stop the radio")

        // A second scan clears the previous results, as the web hook does.
        bt.scan()
        check(bt.devices.isEmpty, "scan() clears previous results")

        // An error surfaces as STATE and ends the scan — never a throw.
        s.error("permission denied")
        check(bt.error == "permission denied", "error surfaces as state")
        check(!bt.scanning, "an error ends the scan")

        // No adapter: scan() is a no-op that explains itself.
        let none = PyreonBluetooth(scanner: FakeScanner(available: false))
        none.scan()
        check(!none.scanning, "an unavailable adapter does not start a scan")
        check(none.error.contains("not available"), "…and says why")
    }
}
