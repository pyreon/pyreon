// PyreonSpeech — the TextToSpeech side of `@pyreon/hooks`' useSpeech.
// Mirror of PyreonSpeech.swift; see that header for why rate/pitch/voice are
// out of scope.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.RememberObserver
import androidx.compose.runtime.mutableStateOf

/** The platform half. Swapped for a fake in tests. */
public interface SpeechSynth {
    public val isAvailable: Boolean
    public fun speak(text: String)
    public fun cancel()
}

public class PyreonSpeech(private val synth: SpeechSynth) : RememberObserver {
    public val speaking: MutableState<Boolean> = mutableStateOf(false)

    public val supported: Boolean get() = synth.isAvailable

    public fun speak(text: String): Boolean {
        if (!synth.isAvailable || text.isEmpty()) return false
        // Cancel first — queueing is the platform default.
        synth.cancel()
        synth.speak(text)
        speaking.value = true
        return true
    }

    public fun stop() {
        synth.cancel()
        speaking.value = false
    }

    // Speech outliving its screen keeps talking to nobody; an engine that
    // holds a system binding (AutoCloseable) is freed too.
    override fun onRemembered() {}
    override fun onForgotten() { stop(); (synth as? AutoCloseable)?.close() }
    override fun onAbandoned() { stop(); (synth as? AutoCloseable)?.close() }
}
