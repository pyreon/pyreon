---
"@pyreon/sync": minor
---

Defer `syncedSignal`'s create-if-missing seed until first sync when a transport is attached — a fresh peer's default no longer clobbers a peer's real value on Yjs's random-clientId `Y.Map` tie-break (issue #2380). The seed still shows `initial` optimistically but only WRITES the CRDT once sync confirms the key is still absent (empty room); it seeds immediately when alone / no-transport / already-synced, and is canceled on dispose. `WebSocketTransport` gains a reactive `synced` signal + `whenSynced()` (the y-websocket convention). Residual: two fresh peers seeding an empty room with different defaults for the same key still tie-break — gate app-level defaults behind `await transport.whenSynced()`.
