// PyreonBluetooth — the CoreBluetooth side of `@pyreon/hooks`' useBluetooth.
//
// Discovery only, matching the web hook's surface: available / scanning /
// devices / error / scan / stopScan. GATT is deliberately out of scope — it
// is where the three platforms stop resembling each other, and a surface
// that only half-crosses is worse than one that says what it covers.
//
// ## Ordering is a contract, not an implementation detail
//
// `devices` is FIRST-SEEN order, deduped by id. That is what the web hook
// does and what the Kotlin runtime does, so it is asserted here rather than
// left to whatever the framework hands back — the same class of divergence
// that had rx's `unique()` returning an arbitrary order on iOS alone.
//
// ## No CoreBluetooth import at this layer
//
// The scan itself lives behind `BluetoothScanner`, so the ordering and
// state logic below is compilable and testable with no CoreBluetooth and no
// device. `CoreBluetoothScanner` is the real implementation and is verified
// on hardware, not by this file's tests — an approximated stub of a radio
// would prove nothing.

import Foundation
import Observation

/// One device seen during a scan.
public struct PyreonBluetoothDevice: Equatable, Codable, Identifiable {
    public let id: String
    public let name: String

    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

/// The platform half of a scan. Swapped for a fake in tests.
public protocol BluetoothScanner: AnyObject {
    /// True when the platform has a usable adapter.
    var isAvailable: Bool { get }
    /// Begin discovery. Each device found calls `onDevice`.
    func startScan(onDevice: @escaping (PyreonBluetoothDevice) -> Void,
                   onError: @escaping (String) -> Void)
    /// End discovery. Safe to call when not scanning.
    func stopScan()
}

/// Observable Bluetooth discovery — the SwiftUI half of `useBluetooth`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonBluetooth {
    public private(set) var scanning: Bool = false
    public private(set) var devices: [PyreonBluetoothDevice] = []
    public private(set) var error: String = ""

    private let scanner: BluetoothScanner

    public var available: Bool { scanner.isAvailable }

    public init(scanner: BluetoothScanner) {
        self.scanner = scanner
    }

    /// Begin discovery, clearing any previous results — the web hook clears
    /// on scan, so this does too.
    public func scan() {
        guard scanner.isAvailable else {
            error = "Bluetooth is not available on this platform"
            return
        }
        error = ""
        devices = []
        scanning = true
        scanner.startScan(
            onDevice: { [weak self] device in
                guard let self else { return }
                // First-seen order, deduped by id. Appending unconditionally
                // would let a repeatedly-advertising device flood the list —
                // BLE peripherals advertise continuously, so this is the
                // common case rather than an edge one.
                if !self.devices.contains(where: { $0.id == device.id }) {
                    self.devices.append(device)
                }
            },
            onError: { [weak self] message in
                guard let self else { return }
                self.error = message
                self.scanning = false
            },
        )
    }

    /// End discovery. Discovered devices are kept, as on the web.
    public func stopScan() {
        guard scanning else { return }
        scanning = false
        scanner.stopScan()
    }

    deinit {
        // A scan outliving its view is a radio left on — the battery-drain
        // shape of the listener-pile-up leak class.
        scanner.stopScan()
    }
}
