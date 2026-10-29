// `<Gesture>` from @pyreon/primitives — the Compose glue. The compiler emits
// `PyreonGesture(onPan = …, onPinch = …, onRotate = …, modifier = …) { … }`.
//
// One pointer loop feeds `PyreonGestureTracker` (PyreonGestureCore.kt, which
// carries the contract and its tests); this file only translates Compose's
// pointer events into the tracker's dp-based samples.

package com.pyreon.runtime

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.calculateCentroidSize
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateRotation
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalViewConfiguration

/**
 * A region that recognises continuous pan / pinch / rotate gestures at once.
 *
 * The pointer loop is keyed on `Unit` and NEVER restarts on recomposition: a
 * handler typically writes state, the write recomposes, and a loop keyed on the
 * handler lambdas (new instances every composition) would be torn down in the
 * middle of the very gesture that triggered it. The tracker instead reads the
 * CURRENT handlers, assigned after every successful composition.
 *
 * Children keep their own taps. The loop listens with `requireUnconsumed =
 * false` (a child's `clickable` consumes the down) and consumes pointer
 * movement only once the gesture is past the platform touch slop — at which
 * point the child's tap detector sees the consumed movement and cancels, and an
 * enclosing scroll container does not also scroll.
 */
@Composable
fun PyreonGesture(
    onPan: ((PyreonPanEvent) -> Unit)? = null,
    onPinch: ((PyreonPinchEvent) -> Unit)? = null,
    onRotate: ((PyreonRotateEvent) -> Unit)? = null,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val density = LocalDensity.current.density
    val slopPx = LocalViewConfiguration.current.touchSlop
    val tracker = remember { PyreonGestureTracker(slop = (slopPx / density).toDouble()) }
    SideEffect {
        tracker.onPan = onPan
        tracker.onPinch = onPinch
        tracker.onRotate = onRotate
    }
    Box(
        modifier = modifier.pointerInput(Unit) {
            awaitEachGesture {
                awaitFirstDown(requireUnconsumed = false)
                try {
                    do {
                        val event = awaitPointerEvent()
                        val pressed = event.changes.count { it.pressed }
                        if (pressed > 0) {
                            val pan = event.calculatePan()
                            val centroid = event.calculateCentroid(useCurrent = true)
                            val claimed = tracker.move(
                                pointers = pressed,
                                panDx = (pan.x / density).toDouble(),
                                panDy = (pan.y / density).toDouble(),
                                zoomChange = event.calculateZoom().toDouble(),
                                rotationChange = event.calculateRotation().toDouble(),
                                cx = (centroid.x / density).toDouble(),
                                cy = (centroid.y / density).toDouble(),
                                spread = (event.calculateCentroidSize(useCurrent = true) / density).toDouble(),
                            )
                            if (claimed) {
                                event.changes.forEach { if (it.positionChanged()) it.consume() }
                            }
                        }
                    } while (event.changes.any { it.pressed })
                } finally {
                    // Also reached when the loop is CANCELLED (the composable left
                    // the tree mid-gesture), so a started gesture always ends.
                    tracker.finish()
                }
            }
        },
    ) {
        content()
    }
}
