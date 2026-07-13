---
'@pyreon/hooks': minor
---

Add `useNotifications()` — post a LOCAL notification (`notify` / `requestPermission`). On the web it uses the Notification API; the PMTC native compiler lowers it to `PyreonNotifications` on iOS (`UNUserNotificationCenter`) and Android (`NotificationManager` + a channel; requires the `POST_NOTIFICATIONS` runtime permission on API 33+, which `NotificationManagerCompat` degrades gracefully without).

The fourth imperative platform-API hook in the multiplatform (M3) track (distinct from `usePush`, which RECEIVES remote push). Reuses the recognition → emit → runtime pipeline from `useShare`. R4 is non-behavioral (the counter's iOS XCUITest asserts the Notify tap fires the call without crashing — a notification's permission prompt + auto-dismissing banner make a reliable behavioral springboard assert infeasible).
