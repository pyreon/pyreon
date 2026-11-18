---
'@pyreon/hooks': patch
'@pyreon/native-compiler': patch
---

Native `useWebSocket` and `useGeolocation` follow the web hooks' lifecycle. A socket now connects on mount even when the component also calls `ws.connect()` (for example, a reconnect button); before, that call turned the mount connect off. `{ autoConnect: false }` is honoured, and the socket closes when the component unmounts. A geolocation watch the app started stops on unmount on iOS (`.onDisappear`) and on Android (the `rememberPyreonGeolocation()` factory disposes it); it kept the GPS on before.
