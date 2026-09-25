---
'@pyreon/config': patch
---

`LatheSection` gains `validate?: 'strict' | 'warn' | 'off'`, mirroring `@pyreon/lathe`'s new option for the generated client's default response validation.

`LatheSection` also gains `pagination`, the declared-pagination map that emits `use<Op>Infinite` hooks.
