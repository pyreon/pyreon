// PyreonAudioRecorder — the Media side of `@pyreon/hooks`' useAudioRecorder.
// Mirror of PyreonAudioRecorder.swift; see that file's header for why start()
// returns a Boolean and stop() returns a URL string or null.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/** The platform half of recording. Swapped for a fake in tests. */
public interface RecordingEngine {
    public val isAvailable: Boolean

    /** Request permission and begin. Returns false when denied or unavailable. */
    public fun begin(): Boolean

    /** End and return a file URL string, or null if nothing was captured. */
    public fun end(): String?

    /** Release the device. Safe when not recording. */
    public fun release()
}

public class PyreonAudioRecorder(private val engine: RecordingEngine) {
    public val recording: MutableState<Boolean> = mutableStateOf(false)
    public val error: MutableState<String> = mutableStateOf("")

    public val supported: Boolean get() = engine.isAvailable

    public fun start(): Boolean {
        if (!engine.isAvailable) {
            error.value = "Audio recording is not available on this platform"
            return false
        }
        if (recording.value) return true
        if (!engine.begin()) {
            error.value = "Microphone permission was denied or no device is available"
            return false
        }
        error.value = ""
        recording.value = true
        return true
    }

    public fun stop(): String? {
        if (!recording.value) return null
        recording.value = false
        val url = engine.end()
        engine.release()
        return url
    }
}
