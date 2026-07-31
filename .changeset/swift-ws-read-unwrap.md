---
'@pyreon/native-compiler': patch
---

Fix the Swift emit producing `ws.isConnected()` / `ws.lastMessage()` /
`ws.messages()` / `ws.error()` as CALLS — the runtime declares them as
properties, so any component that READ a WebSocket field emitted
uncompilable Swift ("cannot call value of non-function type"). Kotlin has
had the read-field unwrap since the hook landed; Swift never did — invisible
to the lowered-hooks typecheck matrix because its usage only ever sent.
Found while device-proving the `useWebSocket` echo round trip.
