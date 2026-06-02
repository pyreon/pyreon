// PyreonReactivity unit-level smoke — exercises the namespace stub
// shipped as the Kotlin parity mirror of `PyreonReactivity.swift`.
// Phase B (native readiness audit 2026-06).
//
// What this verifies:
//   - The namespace object is reachable
//   - RUNTIME_NAME has the documented value
//   - Cross-target string contract (the value is intentionally
//     parallel to the Swift side's `runtimeName`)
//
// What this DOESN'T verify (intentional — scaffold-only file):
//   - Any actual reactive bridging (Compose `mutableStateOf` /
//     `derivedStateOf` are the real primitives; this stub holds a
//     namespace placeholder only)

package com.pyreon.runtime

fun testPyreonReactivityNamespaceReachable() {
    // The object is `PyreonReactivity` — just naming it here is the
    // reachability check. kotlinc would fail to compile otherwise.
    check(PyreonReactivity.RUNTIME_NAME.isNotEmpty()) {
        "PyreonReactivity.RUNTIME_NAME should be non-empty"
    }
}

fun testPyreonReactivityRuntimeNameValue() {
    // The exact string is part of the parity contract — Swift side
    // exposes `@pyreon/native-runtime-swift`; Kotlin exposes the
    // matching `@pyreon/native-runtime-kotlin`. Cross-target drift
    // checks (manual today; CI lint follow-up) compare these.
    check(PyreonReactivity.RUNTIME_NAME == "@pyreon/native-runtime-kotlin") {
        "RUNTIME_NAME should be the documented package name, got=${PyreonReactivity.RUNTIME_NAME}"
    }
}

fun main() {
    testPyreonReactivityNamespaceReachable()
    testPyreonReactivityRuntimeNameValue()
    println("[PyreonReactivityTest] all smoke tests passed")
}
