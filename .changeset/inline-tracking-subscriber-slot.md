---
'@pyreon/reactivity': minor
'@pyreon/solid-compat': minor
---

Two-tier TRACKING-subscriber storage — an `_s1` inline slot mirroring the `_d1` idiom already used for direct updaters.

A census of the row-list and computed-chain workloads found the tracking-subscriber count is exactly **1 in 100% of measured cases**, so the `_s` Set — and its hashed add/delete — was pure overhead there. The first tracking subscriber now lives in a plain field and only a SECOND one promotes to a Set (no demotion; a Set that shrinks back to one entry stays a Set).

Measured in real Chromium/V8, two independent 15-pass round-robin runs, page-isolated per arm, load 4.25–6.87 (median, CI95, arm verified from the loaded module before each sample):

| region | baseline | tier | ratio |
| --- | --- | --- | --- |
| dispose 50k tracked effects | 2.500ms | 1.400ms | **1.79× CI-disjoint** |
| 50k writes through a 20-deep computed chain | 41.6–42.5ms | 35.6–35.7ms | **1.17–1.19× CI-disjoint** |
| 20k batches × 10 writes | 8.8–8.9ms | 7.7–8.0ms | **1.10–1.16× CI-disjoint** |
| 300k writes, 1 tracked subscriber | 7.0ms | 6.4–6.5ms | **1.08–1.09× CI-disjoint** |
| 5k writes × 50 subscribers (Set path) | 8.1–8.2ms | 8.2–8.3ms | tie (unchanged, as intended) |

The notify win comes from deleting a real allocation: reaching a sole subscriber used to require `_s.values().next().value`, materialising a Set iterator plus an iterator-result object **on every write**. `propagateLazyDirty`'s fused chain walk now hops via the inline slot for the same reason.

`deps` records the HOST rather than the host's subscriber Set (there is no Set to record while a source has one subscriber). That also makes verify-mode dep reuse strictly more stable: the `_suspendSoleSubscriber` container swap used to change `host._s`'s identity and spuriously diverge every effect tracking that signal.

Also fixes a latent liveness bug in `@pyreon/solid-compat`'s `createStore` sweep, which tested `_s` alone and so reported "unused" for the dominant single-subscriber shape — evicting a LIVE signal, after which writes to that path stopped re-running its effect. The tier-aware check is now owned by `@pyreon/reactivity` as `_hasSubscribers()` (covering `_s1`/`_s`/`_d1`/`_d`) so consumers cannot re-derive it and miss a tier.

This is a JS-only saving. It is **below the resolution floor of the row-list DOM benchmark**: `clear rows` is timer-quantised at 100µs (the suite reports it "too fast to time"), while the subscriber-teardown saving for a 1,000-row clear is ~22µs. No end-to-end row-list win is claimed.
