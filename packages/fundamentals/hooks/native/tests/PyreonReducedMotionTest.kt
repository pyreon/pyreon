// Smoke tests for PyreonReducedMotion — the Compose `useReducedMotion` reactive flag. Dependency-free `check(...)`
// harness; runs via `verify-kotlin.ts --service=PyreonReducedMotion`.

package com.pyreon.runtime

fun testReducedMotionDefaultsOff() {
    check(!PyreonReducedMotion().enabled.value) { "defaults to false (animate as usual)" }
}

fun testReducedMotionHonorsTheInitialValue() {
    check(PyreonReducedMotion(enabled = true).enabled.value) { "honors an initial true" }
}

fun testReducedMotionUpdateFlipsBothWays() {
    val motion = PyreonReducedMotion()
    motion.update(true)
    check(motion.enabled.value) { "update(true) turns it on" }
    motion.update(false)
    check(!motion.enabled.value) { "update(false) turns it back off" }
}

fun main() {
    testReducedMotionDefaultsOff()
    testReducedMotionHonorsTheInitialValue()
    testReducedMotionUpdateFlipsBothWays()
    println("[PyreonReducedMotionTest] all smoke tests passed")
}
