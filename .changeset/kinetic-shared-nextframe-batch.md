---
'@pyreon/kinetic': patch
---

`nextFrame` now batches all same-burst callbacks into ONE shared double-rAF (2 rAF registrations for a 1000-child stagger instead of 2000) — measured −24% wall on stagger-1000 in real Chromium, flipping it from a 1.27× loss vs Motion One to a statistical tie, and widening the enter-500/stagger-300 wins. A callback registered after the batch's outer frame opens a NEW batch (its "from" state still paints before the transition state applies), the batch is identity-keyed to the scheduling `requestAnimationFrame` (a swapped stub/polyfill can't strand callbacks), and cancel now removes the callback from its batch — effective in every phase, never touching batch siblings, SSR/post-teardown safe by construction.
