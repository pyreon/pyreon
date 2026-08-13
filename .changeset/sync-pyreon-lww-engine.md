---
"@pyreon/sync": minor
---

feat(sync): multiplatform LWW CRDT — dependency-free JS engine + transport + native iOS/Android ports (wire-compatible, converging)

The foundation for 1:1 multiplatform sync. A pure last-writer-wins CRDT engine implementing the engine-neutral `CrdtAdapter` seam, with **no `yjs`** — shipped as THREE wire-compatible engines that converge with each other:

- **Web/JS** (`pyreonAdapter`) + a pure-JS client transport (`connectPyreonSync`, JSON ops over any string duplex) + a `NativeSyncHost` bridge contract. `syncedSignal` runs over it end-to-end.
- **iOS** (`PyreonCrdt.swift`) and **Android** (`PyreonCrdt.kt`) native ports — same `{ ops: [{ map, key, value, clock, actor }] }` wire format, same deterministic LWW merge (higher Lamport clock wins; equal clock → higher actor id), hand-written JSON codec (compiles against the minimal native stubs).

All three converge: concurrent-offline writes resolve to the same winner on every peer, higher-clock-wins, order/duplicate-insensitive, no echo. Verified end to end — JS suite (bisect-covered specs) + the native co-source gate compiles and RUNS the Swift + Kotlin convergence tests (including decoding a web-format message). Scope matches the v1 seam: flat key → scalar registers; rich `Y.Text`/`Y.Array` stay on `@pyreon/sync/yjs`.

PMTC compiles UI + signals, not engine logic, so a CRDT engine can't cross by source compilation — hence real native ports behind the seam (the `PyreonWebSocket`/`PyreonHttp` pattern), giving an iOS/Android/web peer 1:1 convergence over one protocol. Remaining: the reactive UI binding (`@Observable`/`mutableStateOf`) + `PyreonWebSocket` transport wiring + a device convergence test.
