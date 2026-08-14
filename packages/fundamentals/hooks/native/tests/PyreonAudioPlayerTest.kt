// Executable checks for PyreonAudioState — the engine-independent half of
// `<Audio>`. The engine is a fake, so these run with no Android SDK: what is
// under test is the status machine and the volume clamp, both of which must
// match the web arm and the Swift runtime call for call.

package com.pyreon.runtime

private class FakeAudioEngine : AudioEngine {
    val calls: MutableList<String> = mutableListOf()
    var loadedVolume: Double = -1.0

    override fun load(url: String, loop: Boolean, muted: Boolean, volume: Double) {
        loadedVolume = volume
        calls.add("load:$url:loop=$loop:muted=$muted")
    }

    override fun play() { calls.add("play") }
    override fun pause() { calls.add("pause") }
    override fun stop() { calls.add("stop") }
}

private fun expect(cond: Boolean, what: String) {
    if (!cond) {
        System.err.println("FAIL: $what")
        kotlin.system.exitProcess(1)
    }
}

private fun autoPlayStartsPlaying() {
    val e = FakeAudioEngine()
    val s = PyreonAudioState(e)
    expect(s.status == PyreonAudioStatus.WAITING, "starts waiting")
    s.start("a.mp3", autoPlay = true, loop = false, muted = false, volume = 1.0)
    expect(s.status == PyreonAudioStatus.PLAYING, "playing after autoPlay start")
    expect(e.calls == listOf("load:a.mp3:loop=false:muted=false", "play"), "load then play")
}

private fun withoutAutoPlayItLoadsButDoesNotPlay() {
    val e = FakeAudioEngine()
    val s = PyreonAudioState(e)
    s.start("a.mp3", autoPlay = false, loop = false, muted = false, volume = 1.0)
    expect(s.status == PyreonAudioStatus.PAUSED, "paused without autoPlay")
    expect(e.calls == listOf("load:a.mp3:loop=false:muted=false"), "loaded, not played")
}

private fun volumeIsClampedNotRejected() {
    // A volume outside 0..1 is a caller slip; refusing to play would be a
    // worse answer than the nearest legal level. All three arms clamp.
    expect(PyreonAudioState.clampVolume(1.7) == 1.0, "clamps above")
    expect(PyreonAudioState.clampVolume(-3.0) == 0.0, "clamps below")
    expect(PyreonAudioState.clampVolume(0.4) == 0.4, "leaves legal values alone")

    val e = FakeAudioEngine()
    PyreonAudioState(e).start("a.mp3", autoPlay = false, loop = false, muted = false, volume = 9.0)
    expect(e.loadedVolume == 1.0, "the ENGINE receives the clamped value")
}

private fun transportMovesStatus() {
    val e = FakeAudioEngine()
    val s = PyreonAudioState(e)
    s.start("a.mp3", autoPlay = true, loop = false, muted = false, volume = 1.0)
    s.pause()
    expect(s.status == PyreonAudioStatus.PAUSED, "paused")
    s.play()
    expect(s.status == PyreonAudioStatus.PLAYING, "playing again")
    s.stop()
    expect(s.status == PyreonAudioStatus.PAUSED, "stop reports paused")
}

public fun main() {
    autoPlayStartsPlaying()
    withoutAutoPlayItLoadsButDoesNotPlay()
    volumeIsClampedNotRejected()
    transportMovesStatus()
    println("PyreonAudioPlayerTest: ok")
}
