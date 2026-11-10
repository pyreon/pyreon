---
'@pyreon/runtime-dom': patch
---

Keyed `.map` lists reorder through `<For>`'s own reconciler core instead of a second copy of it: entries carry their position, so the separate key→position map and the duplicate longest-increasing-subsequence implementation are gone (−570 B minified, −205 B gzip on the benchmark table app). Behaviour is unchanged.
