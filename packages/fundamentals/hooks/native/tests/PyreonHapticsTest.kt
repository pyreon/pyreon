// Smoke tests for PyreonHaptics — the Compose `useHaptics` fire-and-
// forget haptic wrapper. Mirrors PyreonClipboardTest.kt's dependency-
// free `check(...)` harness; runs via `verify-kotlin.ts --service=
// PyreonHaptics` against the `androidx.compose.ui.hapticfeedback` stubs.
//
// What this covers (pure delegation — no state machine):
//   - `impact(style)` fires exactly one haptic → LongPress
//   - `impact()` with no arg (Kotlin default) fires → LongPress
//   - `notification(type)` fires → LongPress
//   - `selection()` fires → TextHandleMove
//   - Single-arg constructor takes the injected HapticFeedback
//
// What this does NOT cover (device-CI's Android build against REAL
// Compose does): that `LocalHapticFeedback.current` resolves and the
// real `performHapticFeedback` produces a physical buzz — haptics have
// no observable UI and the emulator has no haptic hardware, so this is
// an honest-weak "the code path runs" proof (see docs/multiplatform.md).

package com.pyreon.runtime

import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType

// Recording fake — captures each performHapticFeedback type so the
// smoke can assert the runtime mapped the style string correctly.
private class RecordingHaptic : HapticFeedback {
    val calls = mutableListOf<HapticFeedbackType>()
    override fun performHapticFeedback(hapticFeedbackType: HapticFeedbackType) {
        calls.add(hapticFeedbackType)
    }
}

fun testHapticsImpactFiresLongPress() {
    val rec = RecordingHaptic()
    val h = PyreonHaptics(rec)
    h.impact("light")
    check(rec.calls.size == 1) { "impact(\"light\") fires exactly one haptic" }
    check(rec.calls[0] === HapticFeedbackType.LongPress) { "impact maps to LongPress" }
}

fun testHapticsImpactDefaultArg() {
    val rec = RecordingHaptic()
    val h = PyreonHaptics(rec)
    h.impact()
    check(rec.calls.size == 1) { "impact() with no arg (default medium) still fires" }
    check(rec.calls[0] === HapticFeedbackType.LongPress) { "default impact maps to LongPress" }
}

fun testHapticsNotificationFiresLongPress() {
    val rec = RecordingHaptic()
    val h = PyreonHaptics(rec)
    h.notification("success")
    check(rec.calls.size == 1) { "notification fires one haptic" }
    check(rec.calls[0] === HapticFeedbackType.LongPress) { "notification maps to LongPress" }
}

fun testHapticsSelectionFiresTextHandleMove() {
    val rec = RecordingHaptic()
    val h = PyreonHaptics(rec)
    h.selection()
    check(rec.calls.size == 1) { "selection fires one haptic" }
    check(rec.calls[0] === HapticFeedbackType.TextHandleMove) { "selection maps to TextHandleMove" }
}

fun testHapticsConstructorShape() {
    // Locks the single-arg constructor the compiler emit depends on:
    // `remember { PyreonHaptics(hHaptic) }`. A reshape to a different
    // arity would fail the emitted app's compile; this catches it at
    // the runtime layer too.
    val h = PyreonHaptics(RecordingHaptic())
    h.selection()
}

fun main() {
    testHapticsImpactFiresLongPress()
    testHapticsImpactDefaultArg()
    testHapticsNotificationFiresLongPress()
    testHapticsSelectionFiresTextHandleMove()
    testHapticsConstructorShape()
    println("[PyreonHapticsTest] all smoke tests passed")
}
