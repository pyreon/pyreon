// Executable checks for PyreonDeviceInfo.
//
// NOT @main: a native/tests directory may carry only ONE @main program (the
// linker enforces it), and PyreonBluetoothTests already owns it. This suite
// exposes `runAll()`, which that program calls.
//
// The probe is a fake, so these run with no UIKit and no device. What is
// under test is the READ-THROUGH contract — the reason `screen` is a computed
// property rather than a value captured at init.

import Foundation

final class FakeDeviceProbe: DeviceProbe {
    var model: String
    var osVersion: String
    var isTouch: Bool
    var screen: PyreonDeviceScreen

    init(
        model: String = "iPhone17,2",
        osVersion: String = "18.5",
        isTouch: Bool = true,
        screen: PyreonDeviceScreen = PyreonDeviceScreen(width: 393, height: 852, scale: 3)
    ) {
        self.model = model
        self.osVersion = osVersion
        self.isTouch = isTouch
        self.screen = screen
    }
}

@available(iOS 17.0, macOS 14.0, *)
enum PyreonDeviceInfoTests {
    static func expect(_ cond: Bool, _ what: String) {
        if !cond {
            FileHandle.standardError.write("FAIL: \(what)\n".data(using: .utf8)!)
            exit(1)
        }
    }

    static func runAll() {
        reportsTheProbesValues()
        platformIsCompileTimeConstant()
        screenReadsThrough()
        print("PyreonDeviceInfoTests: ok")
    }

    static func reportsTheProbesValues() {
        let info = PyreonDeviceInfo(probe: FakeDeviceProbe())
        expect(info.model == "iPhone17,2", "model")
        expect(info.osVersion == "18.5", "osVersion")
        expect(info.isTouch, "isTouch")
        expect(info.screen.width == 393, "screen width")
        expect(info.screen.scale == 3, "screen scale")
    }

    static func platformIsCompileTimeConstant() {
        // The web arm returns 'web' and the Kotlin one 'android'; this is the
        // one field that needs no probe on any target.
        expect(PyreonDeviceInfo(probe: FakeDeviceProbe()).platform == "ios", "platform")
    }

    static func screenReadsThrough() {
        let probe = FakeDeviceProbe()
        let info = PyreonDeviceInfo(probe: probe)
        expect(info.screen.width == 393, "initial width")

        // A fold, a rotation or a Stage Manager resize moves this while the
        // app is live. Caching at init would keep reporting the old geometry
        // — which is the bug this property shape exists to prevent.
        probe.screen = PyreonDeviceScreen(width: 852, height: 393, scale: 3)
        expect(info.screen.width == 852, "width AFTER the geometry changed")
        expect(info.screen.height == 393, "height AFTER the geometry changed")
    }
}
