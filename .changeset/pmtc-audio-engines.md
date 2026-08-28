---
'@pyreon/native-compiler': minor
'@pyreon/hooks': minor
---

`<Audio>` now builds. It emitted `AVFoundationAudioEngine()` on iOS and
`Media3AudioEngine(…)` on Android, and both types — along with Android's
`PyreonAudioPlayer` composable — existed ONLY in the validation stubs. The
primitive had never compiled on either platform while both stub gates were
green.

Both engines now ship for real (AVPlayer and ExoPlayer, so remote `src` works
and the audio and video halves share one dependency).

A new gate asserts that every Pyreon-owned type a stub declares AND an emitter
emits is also declared in that language's real runtime — the class that hid all
three.
