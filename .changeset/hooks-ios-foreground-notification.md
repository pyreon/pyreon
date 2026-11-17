---
'@pyreon/hooks': patch
---

On iOS, `useNotifications().notify(title, body)` is now shown when it fires while the app is in the foreground, which is the usual case one second after the tap that posted it. Without a notification-center delegate, iOS presented nothing for a foreground app and did not keep the notification in Notification Center. On Android the notification is posted, and on the web it is shown. The runtime now installs a presenter (banner, list, sound) only when the app has no `UNUserNotificationCenter` delegate of its own, so an app that sets one keeps full control.
