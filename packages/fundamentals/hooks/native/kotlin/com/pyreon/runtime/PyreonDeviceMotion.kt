// PyreonDeviceMotion — the SensorManager side of `@pyreon/hooks`'
// useDeviceMotion. Mirror of PyreonDeviceMotion.swift; see that header for
// why start/stop is explicit rather than always-on.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

public data class PyreonVec3(val x: Double, val y: Double, val z: Double) {
    public companion object {
        public val zero: PyreonVec3 = PyreonVec3(0.0, 0.0, 0.0)
    }
}

/** The platform half. Swapped for a fake in tests. */
public interface MotionSource {
    public val isAvailable: Boolean
    public fun begin(onSample: (PyreonVec3, PyreonVec3) -> Unit): Boolean
    public fun end()
}

public class PyreonDeviceMotion(private val source: MotionSource) {
    public val active: MutableState<Boolean> = mutableStateOf(false)
    public val acceleration: MutableState<PyreonVec3> = mutableStateOf(PyreonVec3.zero)
    public val rotation: MutableState<PyreonVec3> = mutableStateOf(PyreonVec3.zero)

    public val supported: Boolean get() = source.isAvailable

    public fun start(): Boolean {
        if (!source.isAvailable) return false
        if (active.value) return true
        val ok = source.begin { accel, rot ->
            acceleration.value = accel
            rotation.value = rot
        }
        if (ok) active.value = true
        return ok
    }

    public fun stop() {
        if (!active.value) return
        source.end()
        active.value = false
    }
}
