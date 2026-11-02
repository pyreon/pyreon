// PyreonToast queue smoke — the pure add/dismiss/remove/clear + bounded-stack
// behavior, no coroutine (auto-dismiss is exercised implicitly; here we use
// durationMillis = 0 so nothing schedules and the queue state is deterministic).

package com.pyreon.runtime

private fun check(cond: Boolean, msg: String) {
    if (!cond) throw AssertionError(msg)
}

fun main() {
    PyreonToast.clear()

    val id1 = PyreonToast.add("first", durationMillis = 0)
    val id2 = PyreonToast.add("second", type = "error", durationMillis = 0)
    check(PyreonToast.toasts.value.size == 2, "expected 2 toasts")
    check(PyreonToast.toasts.value[0].message == "first", "newest appends last")
    check(PyreonToast.toasts.value[1].type == "error", "type carried")
    check(id1 != id2, "distinct ids (counter, not clock)")

    PyreonToast.dismiss(id1)
    check(PyreonToast.toasts.value.map { it.message } == listOf("second"), "dismiss removes one")
    PyreonToast.remove("missing") // no-op
    check(PyreonToast.toasts.value.size == 1, "removing a missing id is a no-op")

    // Bounded stack: drop the oldest past maxToasts.
    PyreonToast.clear()
    PyreonToast.maxToasts = 3
    for (i in 0 until 5) PyreonToast.add("m$i", durationMillis = 0)
    check(PyreonToast.toasts.value.size == 3, "stack bounded to maxToasts")
    check(
        PyreonToast.toasts.value.map { it.message } == listOf("m2", "m3", "m4"),
        "oldest dropped, newest kept",
    )
    PyreonToast.maxToasts = 50 // restore

    // Action: runAction calls the handler and leaves the toast up (as on the web);
    // the handler is released when the toast goes, so it can never run again.
    PyreonToast.clear()
    var ran = 0
    val a = PyreonToast.add("deleted", durationMillis = 0, actionLabel = "Undo", onAction = { ran += 1 })
    check(PyreonToast.toasts.value.single().actionLabel == "Undo", "action label carried")
    PyreonToast.runAction(a)
    check(ran == 1, "runAction calls the handler")
    check(PyreonToast.toasts.value.size == 1, "running the action does not dismiss")
    PyreonToast.dismiss(a)
    PyreonToast.runAction(a)
    check(ran == 1, "a dismissed toast's handler is released")
    val noHandler = PyreonToast.add("x", durationMillis = 0, actionLabel = "Orphan")
    check(PyreonToast.toasts.value.first { it.id == noHandler }.actionLabel == null, "a label without a handler shows no button")
    val c = PyreonToast.add("y", durationMillis = 0, actionLabel = "Undo", onAction = { ran += 1 })
    PyreonToast.clear()
    PyreonToast.runAction(c)
    check(ran == 1, "clear releases handlers")
    PyreonToast.maxToasts = 1
    val evicted = PyreonToast.add("old", durationMillis = 0, actionLabel = "Undo", onAction = { ran += 1 })
    PyreonToast.add("new", durationMillis = 0)
    PyreonToast.runAction(evicted)
    check(ran == 1, "a toast evicted by the stack bound releases its handler")
    PyreonToast.maxToasts = 50

    // onActionContext: the web's `onClick({ id, dismiss })` — the handler gets
    // THIS toast's id, so dismissing by it removes that toast (onDismiss once).
    PyreonToast.clear()
    val seen = mutableListOf<String>()
    var closed = 0
    val ka = PyreonToast.add("saved", durationMillis = 0, actionLabel = "Undo", onActionContext = { id ->
        seen += id
        PyreonToast.dismiss(id)
    }, onDismiss = { closed += 1 })
    PyreonToast.add("other", durationMillis = 0)
    check(PyreonToast.toasts.value.first { it.id == ka }.actionLabel == "Undo", "a context handler shows the action button")
    PyreonToast.runAction(ka)
    check(seen == listOf(ka), "the context handler receives its own toast's id")
    check(PyreonToast.toasts.value.map { it.message } == listOf("other"), "dismissing by the handed id removes that toast and no other")
    check(closed == 1, "dismissing from the action fires onDismiss exactly once")
    var which = ""
    val both = PyreonToast.add("z", durationMillis = 0, actionLabel = "Go", onAction = { which = "plain" }, onActionContext = { _ -> which = "context" })
    PyreonToast.runAction(both)
    check(which == "plain", "onAction takes precedence when both are passed")
    PyreonToast.clear()
    PyreonToast.clear()

    // onDismiss: fires exactly once when the toast leaves by ANY path (web parity).
    var gone = mutableListOf<String>()
    val d1 = PyreonToast.add("a", durationMillis = 0, onDismiss = { gone.add("a") })
    PyreonToast.dismiss(d1)
    PyreonToast.dismiss(d1)
    check(gone == listOf("a"), "dismiss fires onDismiss exactly once")
    PyreonToast.add("b", durationMillis = 0, onDismiss = { gone.add("b") })
    PyreonToast.add("c", durationMillis = 0, onDismiss = { gone.add("c") })
    PyreonToast.clear()
    check(gone == listOf("a", "b", "c"), "clear fires every onDismiss, oldest first")
    PyreonToast.maxToasts = 1
    PyreonToast.add("old", durationMillis = 0, onDismiss = { gone.add("old") })
    PyreonToast.add("new", durationMillis = 0)
    check(gone.last() == "old", "eviction by the stack bound fires onDismiss")
    PyreonToast.maxToasts = 0
    PyreonToast.add("arrival", durationMillis = 0, onDismiss = { gone.add("arrival") })
    check(gone.last() == "arrival", "a toast evicted on arrival still fires onDismiss")
    PyreonToast.maxToasts = 50
    PyreonToast.clear()
    gone = mutableListOf()
    // Re-entrancy: a handler that enqueues a new toast runs once and the new toast stays.
    val r = PyreonToast.add("r", durationMillis = 0, onDismiss = { gone.add("r"); PyreonToast.add("follow-up", durationMillis = 0) })
    PyreonToast.dismiss(r)
    check(gone == listOf("r"), "a re-entrant onDismiss runs once")
    check(PyreonToast.toasts.value.map { it.message } == listOf("follow-up"), "a toast enqueued from onDismiss stays")
    PyreonToast.clear()

    println("[PyreonToastTest] all smoke tests passed")
}
