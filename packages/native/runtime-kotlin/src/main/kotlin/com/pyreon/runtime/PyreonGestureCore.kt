// `<Gesture>` from @pyreon/primitives — the payload types and the state
// machine, with no Android dependency so `run-kotlin-tests.ts` actually RUNS
// the contract instead of only typechecking it. The Compose glue that feeds it
// pointer events is `PyreonGesture.kt`.
//
// The machine is the Kotlin twin of the web `GestureTracker`
// (packages/core/primitives/src/web/gesture-tracker.ts): nothing before the
// touch slop, pinch and rotate only with two pointers, then exactly one
// "start", any number of "change", and exactly one "end".

package com.pyreon.runtime

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.hypot

/** A pan (drag) update. Translation is cumulative since the gesture began, in dp. */
data class PyreonPanEvent(
    val dx: Double,
    val dy: Double,
    val x: Double,
    val y: Double,
    val phase: String,
)

/** A pinch update. `scale` is cumulative since the gesture began (1 = unchanged). */
data class PyreonPinchEvent(
    val scale: Double,
    val centerX: Double,
    val centerY: Double,
    val phase: String,
)

/** A rotation update. `degrees` is cumulative since the gesture began; positive = clockwise. */
data class PyreonRotateEvent(
    val degrees: Double,
    val phase: String,
)

/**
 * Tracks one gesture, from the first pointer down to the last pointer up.
 *
 * Fed INCREMENTAL samples — exactly what Compose's `calculatePan` /
 * `calculateZoom` / `calculateRotation` return per pointer event — and
 * accumulates them, because the payloads are cumulative since the start.
 * The handlers are read at dispatch time, so the composable can swap them on
 * recomposition without restarting the pointer loop.
 */
class PyreonGestureTracker(private val slop: Double) {
    var onPan: ((PyreonPanEvent) -> Unit)? = null
    var onPinch: ((PyreonPinchEvent) -> Unit)? = null
    var onRotate: ((PyreonRotateEvent) -> Unit)? = null

    private var panX = 0.0
    private var panY = 0.0
    private var scale = 1.0
    private var degrees = 0.0
    private var pastSlop = false
    private var centerX = 0.0
    private var centerY = 0.0
    private var lastPan: PyreonPanEvent? = null
    private var lastPinch: PyreonPinchEvent? = null
    private var lastRotate: PyreonRotateEvent? = null

    /** Whether the gesture has passed the slop — the caller should consume the pointer events. */
    val claimed: Boolean get() = pastSlop

    /**
     * One pointer event. `pointers` is how many are down; `cx`/`cy` the centroid
     * and `spread` the mean distance from it (Compose's centroid size), all in dp.
     * Returns whether the gesture is claimed.
     */
    fun move(
        pointers: Int,
        panDx: Double,
        panDy: Double,
        zoomChange: Double,
        rotationChange: Double,
        cx: Double,
        cy: Double,
        spread: Double,
    ): Boolean {
        val two = pointers >= 2
        panX += panDx
        panY += panDy
        if (two) {
            scale *= zoomChange
            degrees += rotationChange
        }
        if (!pastSlop) {
            pastSlop = hypot(panX, panY) > slop ||
                (two && (abs(1.0 - scale) * spread > slop ||
                    abs(degrees * PI / 180.0 * spread) > slop))
            if (!pastSlop) return false
        }
        onPan?.let { handler ->
            val ev = PyreonPanEvent(panX, panY, cx, cy, if (lastPan == null) "start" else "change")
            lastPan = ev
            handler(ev)
        }
        if (two) {
            onPinch?.let { handler ->
                if (lastPinch == null) {
                    centerX = cx
                    centerY = cy
                }
                val ev = PyreonPinchEvent(scale, centerX, centerY, if (lastPinch == null) "start" else "change")
                lastPinch = ev
                handler(ev)
            }
            onRotate?.let { handler ->
                val ev = PyreonRotateEvent(degrees, if (lastRotate == null) "start" else "change")
                lastRotate = ev
                handler(ev)
            }
        }
        return true
    }

    /** Every pointer is up, or the gesture was cancelled: deliver "end" for each started gesture and reset. */
    fun finish() {
        lastPan?.let { onPan?.invoke(it.copy(phase = "end")) }
        lastPinch?.let { onPinch?.invoke(it.copy(phase = "end")) }
        lastRotate?.let { onRotate?.invoke(it.copy(phase = "end")) }
        panX = 0.0
        panY = 0.0
        scale = 1.0
        degrees = 0.0
        pastSlop = false
        lastPan = null
        lastPinch = null
        lastRotate = null
    }
}
