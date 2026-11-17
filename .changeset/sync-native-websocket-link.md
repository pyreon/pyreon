---
'@pyreon/sync': patch
---

`connectPyreonSync(doc, webSocketChannel(url))` now lowers to iOS and Android. It becomes the native LWW transport over the native WebSocket channel (`PyreonSyncTransport` over `PyreonSyncWebSocketChannel`). The transport opens when the component appears and is disposed when the component leaves, and `link.disconnect()` disposes it early. Before this, the call had no lowering: the doc and its synced signals ran natively but never reached a relay. A custom `SyncChannel` is refused by name.
