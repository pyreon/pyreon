// Smoke tests for PyreonLatest — the box behind `useLatest`. Dependency-free `check(...)` harness; runs via
// `verify-kotlin.ts --service=PyreonLatest`.

package com.pyreon.runtime

fun testLatestHoldsInitialAndLastWrite() {
    val box = PyreonLatest(1L)
    check(box.current == 1L) { "holds the initial value" }
    box.current = 7L
    check(box.current == 7L) { "reads back the last write" }
}

fun testLatestIsSharedByReference() {
    val box = PyreonLatest("a")
    val alias = box
    alias.current = "b"
    check(box.current == "b") { "a long-lived closure over the box sees a later write" }
}

fun main() {
    testLatestHoldsInitialAndLastWrite()
    testLatestIsSharedByReference()
    println("PyreonLatest: ok")
}
