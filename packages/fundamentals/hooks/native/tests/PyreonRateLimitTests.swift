// PyreonRateLimit behaviour — a standalone assertion program the co-source
// verify gate compiles with ../swift/PyreonRateLimit.swift and RUNS.
//
// Byte-aligned with PyreonRateLimitTest.kt and, more importantly, with the
// WEB arm (native-callback-throttle-parity.test.ts) that measured these
// edges before either port existed.
//
// The scheduler is faked so nothing here waits on a real clock: a timing
// test that actually sleeps is a timing test that eventually flakes on a
// loaded runner.

import Foundation

final class FakeScheduler: PyreonScheduler {
    private var next = 0
    private var work: [Int: () -> Void] = [:]

    func schedule(after milliseconds: Int, _ w: @escaping () -> Void) -> Int {
        next += 1
        work[next] = w
        return next
    }
    func cancel(_ token: Int) { work[token] = nil }

    /// Fire every scheduled callback, as elapsing the delay would.
    func advance() {
        let pending = work
        work = [:]
        for (_, w) in pending.sorted(by: { $0.key < $1.key }) { w() }
    }
    var pendingCount: Int { work.count }
}

// NOT @main: a native/tests directory may carry only ONE @main program, and
// PyreonBluetoothTests already owns it. This suite exposes `runAll()`, which
// that entry point calls — the same folding @pyreon/form used for its
// Form + FieldArray suites.
struct PyreonRateLimitTests {
    static func check(_ c: Bool, _ m: String) { if !c { fatalError("PyreonRateLimitTests: \(m)") } }

    static func runAll() {
        debounceHasNoLeadingEdge()
        debounceCollapsesToLast()
        debounceCancel()
        debounceFlush()
        throttleHasLeadingEdge()
        throttleLeadingPlusOneTrailing()
        throttleCancelReArms()
        print("[PyreonRateLimitTests] all assertions passed")
    }

    static func debounceHasNoLeadingEdge() {
        var seen: [Int] = []
        let s = FakeScheduler()
        let d = PyreonDebounced<Int>(delayMs: 40, scheduler: s) { seen.append($0) }
        d(1)
        check(seen.isEmpty, "debounce does NOT lead")
        s.advance()
        check(seen == [1], "debounce fires on the trailing edge")
    }

    static func debounceCollapsesToLast() {
        var seen: [Int] = []
        let s = FakeScheduler()
        let d = PyreonDebounced<Int>(delayMs: 40, scheduler: s) { seen.append($0) }
        d(1); d(2); d(3)
        s.advance()
        check(seen == [3], "a burst collapses to the LAST args")
    }

    static func debounceCancel() {
        var seen: [Int] = []
        let s = FakeScheduler()
        let d = PyreonDebounced<Int>(delayMs: 40, scheduler: s) { seen.append($0) }
        d(1)
        d.cancel()
        s.advance()
        check(seen.isEmpty, "cancel() drops the pending call")
    }

    static func debounceFlush() {
        var seen: [Int] = []
        let s = FakeScheduler()
        let d = PyreonDebounced<Int>(delayMs: 40, scheduler: s) { seen.append($0) }
        d(7)
        d.flush()
        check(seen == [7], "flush() fires immediately")
        s.advance()
        check(seen == [7], "…and the flushed call does NOT fire again")
    }

    static func throttleHasLeadingEdge() {
        var seen: [Int] = []
        let s = FakeScheduler()
        let t = PyreonThrottled<Int>(waitMs: 40, scheduler: s) { seen.append($0) }
        t(1)
        // The whole difference from debounce.
        check(seen == [1], "throttle leads")
    }

    static func throttleLeadingPlusOneTrailing() {
        var seen: [Int] = []
        let s = FakeScheduler()
        let t = PyreonThrottled<Int>(waitMs: 40, scheduler: s) { seen.append($0) }
        t(1); t(2); t(3)
        check(seen == [1], "only the leading call has fired so far")
        s.advance()
        check(seen == [1, 3], "one trailing call, carrying the LAST args")
    }

    static func throttleCancelReArms() {
        var seen: [Int] = []
        let s = FakeScheduler()
        let t = PyreonThrottled<Int>(waitMs: 40, scheduler: s) { seen.append($0) }
        t(1); t(2)
        t.cancel()
        s.advance()
        check(seen == [1], "cancel() drops the trailing call")
        t(9)
        check(seen == [1, 9], "cancel() re-arms the leading edge")
    }
}
