---
"@pyreon/sync": minor
---

Add a native sync transport (`PyreonSyncTransport` on iOS + Android) — the native equivalent of the web `connectPyreonSync(doc, channel)`, wiring a `PyreonCrdtDoc` to a peer over a string-duplex `PyreonSyncChannel` for real-time cross-device collaboration.
