---
'@pyreon/charts': patch
---

Sonification no longer leaks an unhandled promise rejection when playback stops before the audio context finishes resuming. Stopping closes the context, and current Chromium rejects the pending `resume()` with `InvalidStateError`; that rejection, and one from closing an already-closing context, are now handled.
