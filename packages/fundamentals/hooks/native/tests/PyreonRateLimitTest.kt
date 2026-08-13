// Smoke tests for PyreonRateLimit — mirror of PyreonRateLimitTests.swift,
// and of the web arm that measured these edges first.
// The scheduler is faked so nothing waits on a real clock.

package com.pyreon.runtime

private class FakeScheduler : PyreonScheduler {
    private var next = 0
    private val work = LinkedHashMap<Int, () -> Unit>()

    override fun schedule(milliseconds: Int, work: () -> Unit): Int {
        next++
        this.work[next] = work
        return next
    }
    override fun cancel(token: Int) { work.remove(token) }

    /** Fire every scheduled callback, as elapsing the delay would. */
    fun advance() {
        val pending = LinkedHashMap(work)
        work.clear()
        for ((_, w) in pending) w()
    }
}

fun testDebounceHasNoLeadingEdge() {
    val seen = mutableListOf<Int>()
    val s = FakeScheduler()
    val d = PyreonDebounced<Int>(40, s) { seen.add(it) }
    d(1)
    check(seen.isEmpty()) { "debounce does NOT lead" }
    s.advance()
    check(seen == listOf(1)) { "debounce fires on the trailing edge" }
}

fun testDebounceCollapsesToLast() {
    val seen = mutableListOf<Int>()
    val s = FakeScheduler()
    val d = PyreonDebounced<Int>(40, s) { seen.add(it) }
    d(1); d(2); d(3)
    s.advance()
    check(seen == listOf(3)) { "a burst collapses to the LAST args" }
}

fun testDebounceCancel() {
    val seen = mutableListOf<Int>()
    val s = FakeScheduler()
    val d = PyreonDebounced<Int>(40, s) { seen.add(it) }
    d(1)
    d.cancel()
    s.advance()
    check(seen.isEmpty()) { "cancel() drops the pending call" }
}

fun testDebounceFlush() {
    val seen = mutableListOf<Int>()
    val s = FakeScheduler()
    val d = PyreonDebounced<Int>(40, s) { seen.add(it) }
    d(7)
    d.flush()
    check(seen == listOf(7)) { "flush() fires immediately" }
    s.advance()
    check(seen == listOf(7)) { "the flushed call does NOT fire again" }
}

fun testThrottleHasLeadingEdge() {
    val seen = mutableListOf<Int>()
    val s = FakeScheduler()
    val t = PyreonThrottled<Int>(40, s) { seen.add(it) }
    t(1)
    check(seen == listOf(1)) { "throttle leads" }
}

fun testThrottleLeadingPlusOneTrailing() {
    val seen = mutableListOf<Int>()
    val s = FakeScheduler()
    val t = PyreonThrottled<Int>(40, s) { seen.add(it) }
    t(1); t(2); t(3)
    check(seen == listOf(1)) { "only the leading call has fired so far" }
    s.advance()
    check(seen == listOf(1, 3)) { "one trailing call, carrying the LAST args" }
}

fun testThrottleCancelReArms() {
    val seen = mutableListOf<Int>()
    val s = FakeScheduler()
    val t = PyreonThrottled<Int>(40, s) { seen.add(it) }
    t(1); t(2)
    t.cancel()
    s.advance()
    check(seen == listOf(1)) { "cancel() drops the trailing call" }
    t(9)
    check(seen == listOf(1, 9)) { "cancel() re-arms the leading edge" }
}

fun main() {
    testDebounceHasNoLeadingEdge()
    testDebounceCollapsesToLast()
    testDebounceCancel()
    testDebounceFlush()
    testThrottleHasLeadingEdge()
    testThrottleLeadingPlusOneTrailing()
    testThrottleCancelReArms()
    println("[PyreonRateLimitTest] all assertions passed")
}
