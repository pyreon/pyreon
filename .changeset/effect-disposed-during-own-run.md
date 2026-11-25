---
'@pyreon/reactivity': patch
---

A node disposed while its own run is on the stack no longer keeps what the rest of that run registers. An `effect()` that disposes itself (directly, or by synchronously unmounting the component that owns it, or by stopping its scope) now tears down the inner effects, `onCleanup` callbacks, returned cleanup and signal subscriptions that the run created after the dispose. Before, inner effects kept running after their owner was gone and cleanups never ran. A `computed` disposed during its own evaluation keeps that evaluation and does not re-link to its sources. A `renderEffect` disposed during a re-run no longer re-subscribes. A read after a mid-run dispose no longer throws. A stopped `EffectScope` disposes anything registered with it afterwards instead of dropping it while it is still live.
