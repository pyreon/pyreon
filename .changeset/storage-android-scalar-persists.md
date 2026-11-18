---
'@pyreon/storage': patch
---

A scalar `useStorage` (a string, number, boolean or enum) now persists across an app restart on Android. It used to lower to Compose's `rememberSaveable`, which keeps state only within one app session, so the value went back to its initial value after the app was closed. Every type now lowers to the file-backed `rememberPyreonStorage`, matching `localStorage` on the web and `@AppStorage` on iOS.
