---
"@pyreon/hooks": patch
---

`useWakeLock`, `useAudioRecorder` and `useDeviceMotion` now release what they acquired when the acquisition settles AFTER the owning scope disposed (or after `release()`/`stop()` ran). Previously an unmount during the permission prompt left the screen lock held, the microphone stream live (OS recording indicator on) or the motion listener attached, with nothing able to release it.
