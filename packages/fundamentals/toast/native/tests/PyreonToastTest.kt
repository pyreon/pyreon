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

    println("[PyreonToastTest] all smoke tests passed")
}
