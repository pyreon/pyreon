// PyreonStreamAndroid — the main-thread executor the emitted `useStream`
// passes to PyreonStream, kept out of PyreonStream.kt so the container and its
// wire parsers stay plain JVM (their tests and the byte-parity harness compile
// them with no Android SDK).
//
// Posts unconditionally rather than running inline when already on main, for
// the reason PyreonWebSocketOkHttp gives: the reader thread never delivers on
// main, so the check would always take the post branch anyway, and an inline
// fast path can reorder a later write ahead of an earlier queued one.

package com.pyreon.runtime

import android.os.Handler
import android.os.Looper

/** The Android main looper as an [java.util.concurrent.Executor]. */
public object PyreonStreamMain : java.util.concurrent.Executor {
    private val handler: Handler by lazy { Handler(Looper.getMainLooper()) }

    override fun execute(command: Runnable) {
        handler.post(command)
    }
}
