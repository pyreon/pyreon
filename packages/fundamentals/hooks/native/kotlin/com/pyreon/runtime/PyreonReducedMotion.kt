// PyreonReducedMotion — the native runtime container `useReducedMotion()` lowers to.
//
// A reactive flag for the OS "reduce motion" preference (Compose `MutableState`, read `.value`):
//
//     motion.enabled.value   // true while the user asks for less animation
//
// This file is the pure state container and is free of `android.*`, so it compiles against the Compose-only kotlinc
// validate stubs and runs on a plain JVM. The live Android source (the "Remove animations" / animator-duration-scale
// setting, observed through a ContentObserver) lives in PyreonReducedMotionAndroid.kt (`rememberPyreonReducedMotion()`),
// for the same gate reason PyreonAppState splits its Android edge out.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

public class PyreonReducedMotion(enabled: Boolean = false) {
    /** True while reduced motion is requested. Read `.value`; drives recomposition. */
    public val enabled: MutableState<Boolean> = mutableStateOf(enabled)

    /** Set the flag directly (used by the Android source + tests). */
    public fun update(enabled: Boolean) {
        this.enabled.value = enabled
    }
}
