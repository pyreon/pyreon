---
'@pyreon/primitives': patch
'@pyreon/runtime-dom': patch
---

Tests for the two modules that landed under-covered today and turned `Coverage (Full)` red on every main run.

`<Video>` (the canonical media primitive) shipped at 8.33% statements, dragging `@pyreon/primitives` to 96.78% against its 99% gate. It now has happy-dom coverage for the whole contract: src dispatch (bare name → bundled asset, absolute URL and path-style pass through untouched), the autoplay/loop/muted defaults, unconditional `playsinline`, dimension resolution, and the three-media-event → `onStatusChange` mapping where `pause` → `'paused'` is the rename most likely to be got wrong. 96.78% → 99.73%.

`hydration-plan.ts` (row-plan replay hydration) shipped at 72.57% statements / 59.34% branches. The new tests target its BAIL contract, which is where a fast path's correctness actually lives — every row shape outside the supported grammar must be refused rather than half-understood — plus `tplAdoptVerify`. 72.57% → 78%.
