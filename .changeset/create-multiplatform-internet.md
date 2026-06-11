---
'@pyreon/create-multiplatform': patch
---

Android scaffold manifest ships `android.permission.INTERNET` by default — without it, the first `useFetch` call fails with the opaque `SocketException: socket failed: EPERM` (a real device-CI finding). Harmless for apps that never touch the network.
