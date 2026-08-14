---
"@pyreon/sync": minor
---

Add real WebSocket channels for native cross-device CRDT sync: `PyreonSyncWebSocketChannel` (Swift, URLSessionWebSocketTask) and its Android OkHttp twin, both implementing `PyreonSyncChannel` so `PyreonSyncTransport` can converge two devices over a live socket relay.
