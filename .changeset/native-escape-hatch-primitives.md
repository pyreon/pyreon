---
'@pyreon/primitives': minor
---

Add the escape-hatch primitives `<Web>` / `<NativeIOS>` / `<NativeAndroid>` — Layer-4 per-platform branch selection for multiplatform apps. Exactly one branch renders per target: on web, `<Web>` renders its children and `<NativeIOS>`/`<NativeAndroid>` render nothing; the PMTC compiler mirrors this on native (iOS emits the `<NativeIOS>` branch, Android the `<NativeAndroid>` branch, each dropping the others). This lets one source carry a platform-specific subtree — e.g. a web-only-rich chart behind `<Web>` and a native equivalent behind `<NativeIOS>`/`<NativeAndroid>` — and is the foundation for the heavy-viz multiplatform story (the planned `<WebView>` embed builds on it). Verified end-to-end: a scaffolded app using all three builds on both an Android emulator and an iOS Simulator, and the web runtime renders the matching branch only.
