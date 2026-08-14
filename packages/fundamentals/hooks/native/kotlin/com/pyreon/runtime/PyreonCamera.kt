// PyreonCamera — the capture side of `@pyreon/hooks`' useCamera. Mirror of
// PyreonCamera.swift; see that file's header for why a custom viewfinder is
// out of scope.
//
// Shaped like PyreonImagePicker so the emit wires it the same way: the
// Compose launcher is assigned from the composition, and `onResult` feeds the
// pending continuation.

package com.pyreon.runtime

import kotlin.coroutines.Continuation
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

public class PyreonCamera {
    /** Assigned from the composition — see the emit. */
    public var launch: (() -> Unit)? = null

    /** True when a capture flow can be opened at all. */
    public var available: Boolean = true

    private var pending: Continuation<String?>? = null

    public fun isAvailable(): Boolean = available && launch != null

    /**
     * Never throws. A cancelled capture and an unavailable camera are both
     * null — from a caller's side they are the same outcome: no photo.
     */
    public suspend fun capture(): String? {
        if (!isAvailable()) return null
        return suspendCoroutine { cont ->
            pending = cont
            launch?.invoke()
        }
    }

    /** Called by the launcher callback the emit wires up. */
    public fun onResult(uri: String?) {
        // Resume ONCE: a launcher that fires twice would otherwise crash on a
        // double resume. Cheap to guard, fatal to miss.
        val c = pending ?: return
        pending = null
        c.resume(uri)
    }
}
