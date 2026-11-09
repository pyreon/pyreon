// Executable checks for PyreonReducedMotion.
//
// NOT @main: this directory's single @main (PyreonBluetoothTests) calls `runAll()`. The flag + start/stop machine
// is pure; on macOS there is no UIKit, so `start()` attaches nothing, which is exactly what is asserted to be safe.

import Foundation

@available(iOS 17.0, macOS 14.0, *)
enum PyreonReducedMotionTests {
    static func expect(_ cond: Bool, _ what: String) {
        if !cond {
            FileHandle.standardError.write("FAIL: \(what)\n".data(using: .utf8)!)
            exit(1)
        }
    }

    static func runAll() {
        pinnedValueWins()
        updateFlipsBothWays()
        startAndStopAreIdempotent()
    }

    static func pinnedValueWins() {
        expect(PyreonReducedMotion(enabled: true).enabled == true, "a pinned true is honored")
        expect(PyreonReducedMotion(enabled: false).enabled == false, "a pinned false is honored")
    }

    static func updateFlipsBothWays() {
        let motion = PyreonReducedMotion(enabled: false)
        motion.update(true)
        expect(motion.enabled == true, "update(true)")
        motion.update(false)
        expect(motion.enabled == false, "update(false)")
    }

    static func startAndStopAreIdempotent() {
        let motion = PyreonReducedMotion(enabled: false)
        motion.stop() // before any start: a no-op
        expect(!motion.isMonitoring, "bare stop leaves it not monitoring")
        motion.start()
        motion.start() // second start while running: a no-op
        expect(motion.isMonitoring, "start attaches")
        motion.stop()
        motion.stop()
        expect(!motion.isMonitoring, "stop detaches, and is idempotent")
    }
}
