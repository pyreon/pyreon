---
'@pyreon/reactivity': patch
'@pyreon/store': patch
---

perf(store,reactivity): with-subscriber `patch()` ~2× faster — flips the documented 1.7× loss to Zustand into a win

`@pyreon/reactivity` gains the internal `_suspendSoleSubscriber`/`_resumeSoleSubscriber` pair: when a caller's listener is the SOLE `subscribe()` subscriber on a signal (the dominant shape for `@pyreon/store`'s per-field change detectors), suspension is an O(1) `_s` field swap that detaches/restores the whole Set by identity instead of a function-key `Set.delete`/`add` pair (measured as the single largest component of the store's with-subscriber patch, ~25%). The hot signal write path is untouched; the same Set object is restored so verify-mode dep reuse identity compares and `subscribe()` disposers are unaffected, and a listener subscribing during the window is never clobbered.

`@pyreon/store`'s with-subscriber object-form `patch()` uses it via a `detectorEpoch` guard (falls back to the per-listener suspend whenever the detector wiring changed mid-patch or user listeners/effects share the field's subscriber set — behavior-identical to before), and its suspend/write/resume loop now lives in a CACHED batch closure (mirroring `ensureApply` — zero per-patch closure allocation, re-entrancy-safe via slot-read-into-locals). All #2307 exception-safety guarantees are preserved exactly (getter reads hoisted before suspension, resume in `finally`, flag reset + emit in `finally`); the per-key `{key,oldValue,newValue}` event model and single-notification contract are unchanged.

Measured (`bun run bench:stores`, per-(op×impl) process isolation): patch-2-fields-with-subscriber ~146ns → ~73ns — now FASTER than Zustand's shallow-merge notify (~84ns) instead of 1.7× slower. All other ops unchanged (dispatch/write→1sub/no-sub-patch wins hold; setup unchanged).
