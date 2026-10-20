---
'@pyreon/ui-core': patch
---

`PyreonUI` and the core `Provider` now build their context value once instead of on every accessor call. Rocketstyle reads that accessor on each theme/mode property access, and every call allocated a fresh object literal with getters (~0.4µs on V8). The getters still read the theme and mode lazily, so reactivity is unchanged; the value now has a stable identity. Server-rendering real `@pyreon/ui-components` (Button, Badge, Paragraph) on Node drops from 15.2 to 12.4µs per component (−18%).
