---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

`usePush()` now receives notifications with zero app wiring — the receipt half was the never-wired class. Swift: the no-arg `PyreonPushNotifications.start()` (called by the emit from `.onAppear` on the stable host) installs a container-owned `UNUserNotificationCenter` delegate — foreground presentation and taps land in `notificationReceived`, `requestAuthorization` drives `authorize`; `simctl push` exercises exactly this pipeline, credential-free. Kotlin: `rememberPyreonPushNotifications()` registers a NOT_EXPORTED BroadcastReceiver delivery seam on `PYREON_PUSH_ACTION` for the composable's lifetime (an FCM service forwards into the same seam). The APNs token and FCM transport stay app-wired via `start(register)` — the first start of either kind wins.
