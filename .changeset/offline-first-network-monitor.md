---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-kotlin': minor
---

Give `useOnline()` a real connectivity monitor on Android, and make the database presence check compile.

- **`useOnline()` on Android reported `true` forever.** `PyreonNetworkStatus` shipped as a pure state container defaulting to online, with a `start(register)` seam for the app to wire its own `ConnectivityManager.NetworkCallback` — and nothing wired it, so the hook could not report the device's real state no matter what the radios did. A new `rememberPyreonNetworkStatus()` self-installs a real callback (seeded from the current state, torn down on leave, degrading to the optimistic default if `ACCESS_NETWORK_STATE` is missing rather than crashing). An app that wants different semantics still calls `start()` with its own registrar. Same shape as the geolocation registry fix: a default that requires a step nobody takes is not a default.
- **`const found = db.get(c, id); if (found) { … }` compiled on neither target.** Reading a row and branching on whether it exists is the single most common database shape, and `db.get`'s optional record return had no inference model, so the condition emitted a bare optional — swiftc "optional type 'PyreonRecord?' cannot be used as a boolean", kotlinc "condition type mismatch". `database.get` now joins `SERVICE_METHOD_RETURNS`, which also gives Swift the `if let` binding so the body sees the unwrapped value.

Both found by writing the natural offline-first shape for the Offline/sync matrix row, and both bisect-verified on device.
