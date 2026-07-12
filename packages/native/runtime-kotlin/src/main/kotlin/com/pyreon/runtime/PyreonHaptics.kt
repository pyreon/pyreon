// PyreonHaptics — the Compose side of Pyreon's haptic-feedback service
// (M3.1). Mirrors the Swift `PyreonHaptics` one-for-one + the core
// `@pyreon/hooks` `useHaptics` shape.
//
// Surface:
//
//     haptics.impact("light")          // a physical impact
//     haptics.notification("success")  // a semantic outcome
//     haptics.selection()              // a light selection tick
//
// ## Why LocalHapticFeedback (not Vibrator)
//
// Android has two haptic paths: the `Vibrator` system service (rich
// control, but requires the `VIBRATE` permission AND a `Context`, and
// SILENTLY no-ops without the permission — a footgun) and Compose's
// `LocalHapticFeedback` composition-local (NO permission, NO Context,
// can't silently fail from a missing manifest entry). For a v1 haptics
// hook the composition-local is the honest, robust choice.
//
// The trade-off is FIDELITY: `LocalHapticFeedback` exposes only two
// stable feedback types (`LongPress`, `TextHandleMove`), so iOS's five
// impact styles + three notification outcomes collapse onto the nearest
// constant here. The API surface is uniform with iOS/web; the richness
// is not — a genuine platform difference, documented in
// docs/multiplatform.md and the @pyreon/hooks reference.
//
// `HapticFeedback` is captured at CONSTRUCTION time (not per-call) so the
// public method signatures match Swift's one-for-one. PMTC emits
// `val hHaptic = LocalHapticFeedback.current` (a composition-local read,
// hoisted to a sibling val because it can't live inside a non-Composable
// `remember { … }` lambda) + `remember { PyreonHaptics(hHaptic) }`.

package com.pyreon.runtime

import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType

/**
 * Fire-and-forget haptic-feedback wrapper — the Compose half of
 * `useHaptics`. Lives as `remember { PyreonHaptics(LocalHapticFeedback.current) }`
 * inside a composable (per the PMTC emit pattern). No reactive state; each
 * method delegates to the injected `HapticFeedback`.
 */
class PyreonHaptics(private val haptic: HapticFeedback) {
    /**
     * A physical impact. Compose's `LocalHapticFeedback` exposes only
     * `LongPress` and `TextHandleMove`, so every impact style maps to
     * `LongPress` (the closest to iOS's impact generators). The `style`
     * arg is part of the cross-platform contract even though Android
     * can't differentiate it — iOS/web do.
     */
    fun impact(style: String = "medium") {
        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
    }

    /** A semantic outcome. Maps to `LongPress` (nearest available). */
    fun notification(type: String) {
        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
    }

    /** A light selection tick — maps to `TextHandleMove`. */
    fun selection() {
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
    }
}
