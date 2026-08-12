// PyreonToast queue behavior — a standalone assertion program the co-source
// verify gate compiles together with ../swift/PyreonToast.swift (with
// -parse-as-library) and runs (swiftc + execute; macOS). Not shipped — lives
// under native/tests/, outside the aggregated native/swift/ source dir.

import Foundation

@main
struct PyreonToastTests {
    static func check(_ cond: Bool, _ message: String) {
        if !cond { fatalError("PyreonToastTests: \(message)") }
    }

    static func main() {
        guard #available(iOS 17.0, macOS 14.0, *) else {
            print("[PyreonToastTests] skipped (needs iOS 17 / macOS 14 for @Observable)")
            return
        }
        // enqueue: newest last, distinct monotonic ids, type carried
        let t = PyreonToast()
        let id1 = t.add("first", duration: 0)
        let id2 = t.add("second", type: "error", duration: 0)
        check(t.toasts.count == 2, "expected 2 toasts")
        check(t.toasts[0].message == "first", "newest appends last")
        check(t.toasts[1].type == "error", "type carried")
        check(id1 != id2, "two add()s get distinct ids (counter, not clock)")

        // dismiss removes one; removing a missing id is a no-op; clear empties
        t.dismiss(id1)
        check(t.toasts.map { $0.message } == ["second"], "dismiss removes one")
        t.remove("missing")
        check(t.toasts.count == 1, "removing a missing id is a no-op")
        t.clear()
        check(t.toasts.isEmpty, "clear empties the queue")

        // bounded stack: drop the oldest past maxToasts
        t.maxToasts = 3
        for i in 0..<5 { _ = t.add("m\(i)", duration: 0) }
        check(t.toasts.count == 3, "stack bounded to maxToasts")
        check(t.toasts.map { $0.message } == ["m2", "m3", "m4"], "oldest dropped, newest kept")

        print("[PyreonToastTests] all assertions passed")
    }
}
