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

        // action: runAction calls the handler and leaves the toast up (as on the
        // web); the handler is released when the toast goes.
        let q = PyreonToast()
        var ran = 0
        let a = q.add("deleted", duration: 0, actionLabel: "Undo", onAction: { ran += 1 })
        check(q.toasts.first?.actionLabel == "Undo", "action label carried")
        q.runAction(a)
        check(ran == 1, "runAction calls the handler")
        check(q.toasts.count == 1, "running the action does not dismiss")
        q.dismiss(a)
        q.runAction(a)
        check(ran == 1, "a dismissed toast's handler is released")
        let orphan = q.add("x", duration: 0, actionLabel: "Orphan")
        check(q.toasts.first { $0.id == orphan }?.actionLabel == nil, "a label without a handler shows no button")
        let c = q.add("y", duration: 0, actionLabel: "Undo", onAction: { ran += 1 })
        q.clear()
        q.runAction(c)
        check(ran == 1, "clear releases handlers")
        q.maxToasts = 1
        let evicted = q.add("old", duration: 0, actionLabel: "Undo", onAction: { ran += 1 })
        _ = q.add("new", duration: 0)
        q.runAction(evicted)
        check(ran == 1, "a toast evicted by the stack bound releases its handler")

        // onDismiss: fires exactly once when the toast leaves by ANY path (web parity).
        let w = PyreonToast()
        var gone: [String] = []
        let d1 = w.add("a", duration: 0, onDismiss: { gone.append("a") })
        w.dismiss(d1)
        w.dismiss(d1)
        check(gone == ["a"], "dismiss fires onDismiss exactly once")
        _ = w.add("b", duration: 0, onDismiss: { gone.append("b") })
        _ = w.add("c", duration: 0, onDismiss: { gone.append("c") })
        w.clear()
        check(gone == ["a", "b", "c"], "clear fires every onDismiss, oldest first")
        w.maxToasts = 1
        _ = w.add("old", duration: 0, onDismiss: { gone.append("old") })
        _ = w.add("new", duration: 0)
        check(gone.last == "old", "eviction by the stack bound fires onDismiss")
        w.maxToasts = 0
        _ = w.add("arrival", duration: 0, onDismiss: { gone.append("arrival") })
        check(gone.last == "arrival", "a toast evicted on arrival still fires onDismiss")
        w.maxToasts = 50
        w.clear()
        gone = []
        // Re-entrancy: a handler that enqueues a new toast runs once and the new toast stays.
        let r = w.add("r", duration: 0, onDismiss: { gone.append("r"); _ = w.add("follow-up", duration: 0) })
        w.dismiss(r)
        check(gone == ["r"], "a re-entrant onDismiss runs once")
        check(w.toasts.map { $0.message } == ["follow-up"], "a toast enqueued from onDismiss stays")

        print("[PyreonToastTests] all assertions passed")
    }
}
