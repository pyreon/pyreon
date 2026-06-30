---
"@pyreon/store": patch
---

perf: leaner object-form `patch()`. When no subscriber is attached (the common case) `patch({...})` no longer allocates a per-key `{key,newValue,oldValue}` event object during the batched write — those events only feed the patch-`subscribe` notification, which is gated on `subscribers.size > 0`, so with no subscriber they were pure allocation waste. The per-patched-key membership test also uses a precomputed `Set` (`signalKeySet.has`) instead of an O(signalKeys) `Array.includes` scan (scales with store width). ~12% faster patch (controlled same-run A/B); byte-identical behavior, all 135 tests pass. The remaining gap to a plain object merge is intrinsic to the per-field-signal model. Surfaced by the `bench:stores` benchmark.
