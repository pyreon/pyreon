---
"@pyreon/sync": minor
---

Native `PyreonSyncedSignal` (iOS + Android) now writes create-if-missing seeds into a separate `"<map>:defaults"` map, mirroring web #2519. Reads resolve real map → defaults map → `initial`, so a fresh peer's default can never clobber real data on an actor tie-break. Residual (same as web): two fresh peers seeding an empty room with different defaults still tie-break, but among defaults only — peers converge (harmless), they never diverge and a real value is never lost.
