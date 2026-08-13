// Executable checks for PyreonSafeArea + PyreonScreenOrientation.
//
// NOT @main: a native/tests directory may carry only ONE @main program and
// PyreonBluetoothTests owns it. This exposes `runAll()`, which that calls.
//
// The probes are fakes, so these run with no UIKit and no device. What is
// under test is the READ-THROUGH contract — the reason both are computed
// properties rather than values captured at init.

import Foundation

final class FakeSafeAreaProbe: SafeAreaProbe {
    var insets: PyreonSafeAreaInsets
    init(_ insets: PyreonSafeAreaInsets = PyreonSafeAreaInsets(top: 59, right: 0, bottom: 34, left: 0)) {
        self.insets = insets
    }
}

final class FakeOrientationProbe: OrientationProbe {
    var type: String
    var angle: Int
    init(type: String = "portrait", angle: Int = 0) {
        self.type = type
        self.angle = angle
    }
}

@available(iOS 17.0, macOS 14.0, *)
enum PyreonSafeAreaTests {
    static func expect(_ cond: Bool, _ what: String) {
        if !cond {
            FileHandle.standardError.write("FAIL: \(what)\n".data(using: .utf8)!)
            exit(1)
        }
    }

    static func runAll() {
        reportsInsets()
        insetsReadThrough()
        reportsOrientation()
        orientationReadsThrough()
        print("PyreonSafeAreaTests: ok")
    }

    static func reportsInsets() {
        let sa = PyreonSafeArea(probe: FakeSafeAreaProbe())
        // A notched portrait phone: status area on top, home indicator below.
        expect(sa.insets.top == 59, "top")
        expect(sa.insets.bottom == 34, "bottom")
        expect(sa.insets.left == 0, "left")
    }

    static func insetsReadThrough() {
        let probe = FakeSafeAreaProbe()
        let sa = PyreonSafeArea(probe: probe)
        expect(sa.insets.top == 59, "initial top")

        // Rotating to landscape moves the insets to the sides. Caching at
        // init would keep reporting the portrait values — content would then
        // draw under the notch, which is the whole bug this hook prevents.
        probe.insets = PyreonSafeAreaInsets(top: 0, right: 59, bottom: 21, left: 59)
        expect(sa.insets.top == 0, "top AFTER rotation")
        expect(sa.insets.left == 59, "left AFTER rotation")
    }

    static func reportsOrientation() {
        let o = PyreonScreenOrientation(probe: FakeOrientationProbe())
        expect(o.type == "portrait", "type")
        expect(o.angle == 0, "angle")
    }

    static func orientationReadsThrough() {
        let probe = FakeOrientationProbe()
        let o = PyreonScreenOrientation(probe: probe)
        probe.type = "landscape"
        probe.angle = 90
        expect(o.type == "landscape", "type AFTER rotation")
        expect(o.angle == 90, "angle AFTER rotation")
    }
}
