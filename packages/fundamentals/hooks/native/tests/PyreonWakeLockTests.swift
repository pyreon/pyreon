// Executable checks for PyreonWakeLock.
//
// NOT @main: a native/tests directory may carry only ONE @main program (the
// linker enforces it), and PyreonBluetoothTests already owns it. This suite
// exposes `runAll()`, which that program calls.
//
// The controller is a fake, so these run with no UIKit and no device — what
// is under test is the held/released machine and its idempotency, which is
// the half that must match the web arm call-for-call.

import Foundation

final class FakeIdleTimer: IdleTimerController {
    var isSupported: Bool
    /// Every setIdleTimerDisabled call, in order — so a test can prove the
    /// platform was touched the right number of times, not merely that the
    /// observable flag ended up right.
    private(set) var calls: [Bool] = []

    init(supported: Bool = true) {
        self.isSupported = supported
    }

    func setIdleTimerDisabled(_ disabled: Bool) {
        calls.append(disabled)
    }
}

@available(iOS 17.0, macOS 14.0, *)
enum PyreonWakeLockTests {
    static func expect(_ cond: Bool, _ what: String) {
        if !cond {
            FileHandle.standardError.write("FAIL: \(what)\n".data(using: .utf8)!)
            exit(1)
        }
    }

    static func runAll() {
        acquiresAndReleases()
        requestIsIdempotent()
        releaseIsIdempotent()
        unsupportedNeverHolds()
        print("PyreonWakeLockTests: ok")
    }

    static func acquiresAndReleases() {
        let timer = FakeIdleTimer()
        let lock = PyreonWakeLock(controller: timer)
        expect(lock.active == false, "starts released")
        expect(lock.supported == true, "reports supported")

        expect(lock.request() == true, "request succeeds")
        expect(lock.active == true, "active after request")
        expect(timer.calls == [true], "platform held exactly once")

        lock.release()
        expect(lock.active == false, "released")
        expect(timer.calls == [true, false], "platform released exactly once")
    }

    static func requestIsIdempotent() {
        let timer = FakeIdleTimer()
        let lock = PyreonWakeLock(controller: timer)
        _ = lock.request()
        _ = lock.request()
        // The web arm asserts the same thing by counting wakeLock.request
        // calls: a second request must not take a second lock.
        expect(timer.calls == [true], "second request does not re-hold")
        expect(lock.active == true, "still active")
    }

    static func releaseIsIdempotent() {
        let timer = FakeIdleTimer()
        let lock = PyreonWakeLock(controller: timer)
        lock.release()
        expect(timer.calls.isEmpty, "release while unheld touches nothing")
        _ = lock.request()
        lock.release()
        lock.release()
        expect(timer.calls == [true, false], "second release touches nothing")
    }

    static func unsupportedNeverHolds() {
        let timer = FakeIdleTimer(supported: false)
        let lock = PyreonWakeLock(controller: timer)
        expect(lock.supported == false, "reports unsupported")
        // Matches the web arm's rejected-request path: a plain false, and
        // the platform is never touched.
        expect(lock.request() == false, "request returns false")
        expect(lock.active == false, "never becomes active")
        expect(timer.calls.isEmpty, "platform untouched")
    }
}
