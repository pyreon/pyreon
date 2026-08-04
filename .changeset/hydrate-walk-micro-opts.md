---
'@pyreon/runtime-dom': patch
---

Hydration walk micro-optimizations: diagnostic path strings (which compounded per element — thousands of growing string allocations per hydration) are now built only outside production, and the hot cursor-scan exits take an inline element fast path. Strictly less work per hydrated element; no measured median shift on the 1,000-row hydration benchmark (honest null — the remaining gap vs Vue is per-node dispatch, tracked separately as compiled-template hydration).
