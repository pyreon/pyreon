---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

`useAppState()` now observes the real app lifecycle with zero wiring — the third member of the never-wired class. Swift: the emit calls `PyreonAppState.start()` from `.onAppear` on the stable host (the UIApplication notification observers existed from inception; nothing called them). Kotlin: `rememberPyreonAppState()` installs a `LifecycleEventObserver` on the hosting Activity for the composable's lifetime (ON_RESUME/ON_PAUSE/ON_STOP → active/inactive/background). Both containers gain a sticky `wasBackgrounded` flag — the device-assertable end-state a frozen container can never reach.
