---
'@pyreon/native-compiler': minor
'@pyreon/hooks': minor
---

`<Video controls={false}>` now hides the transport controls on iOS and Android.
The prop was typed and documented on all three targets and honoured on none:
neither native runtime took the parameter, and the Kotlin one hardcoded
`useController = true`.

Compose needed a parameter passed through to `PlayerView.useController`. AVKit's
`VideoPlayer` always draws controls with no way to turn them off, so the Swift
runtime gained an `AVPlayerLayer`-backed representable for the chrome-less case
— same player, same lifecycle, no chrome.
