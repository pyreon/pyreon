---
'@pyreon/rocketstyle': patch
---

Rocketstyle components mount faster. The theme attributes each component instance reads (`theme`, `mode`, `isDark`, `isLight`) are now a small class with prototype getters instead of an object literal with getters, which V8 is slow to create. Server-rendering 200 rocketstyle components dropped from about 952 µs to about 802 µs on Node (−16%), and by 5–10% on Bun. The getters still read the reactive theme context on every access, so tracking is unchanged.
