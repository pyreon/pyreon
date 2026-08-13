---
'@pyreon/hooks': minor
'@pyreon/native-compiler': minor
---

Add `useWakeLock` — keep the screen awake on web, iOS and Android from one call.

Lowers to `isIdleTimerDisabled` on iOS and `FLAG_KEEP_SCREEN_ON` on Android,
with `PyreonWakeLock` runtimes co-located in `@pyreon/hooks`.

The web arm carries a normalization the native ones do not need. A
`WakeLockSentinel` is released by the browser whenever the document hides and
is **not** reacquired, while the native flag survives backgrounding — so the
same call would leave the screen sleeping on web and lit on native. The hook
listens for the sentinel's `release` event and re-acquires on
`visibilitychange` unless the caller explicitly released, which is what makes
it 1:1 rather than merely mirrored.

Also closes a gap in `check-native-cosource`: it failed on a *declared* Kotlin
runtime file that did not exist, but never on a file that exists and is
declared nowhere — so such a file was silently never verified.
`PyreonWebView.kt` had been in that state. The gate now requires every runtime
`.kt` to sit in a service group or in a new `pyreon.native.kotlinSdkOnly` list
(files importing the real Android SDK, which the device gate covers), so a
deliberate omission and a forgotten one are no longer indistinguishable.
