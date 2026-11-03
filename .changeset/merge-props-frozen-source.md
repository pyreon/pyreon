---
'@pyreon/core': patch
---

`mergeProps` no longer throws when an earlier source is frozen or has a read-only key (`mergeProps(Object.freeze({ size: 'md' }), { size: 'lg' })`). The later value now overrides it, as in 0.53. The same fix covers rocketstyle and `Element`, which merge props through the same helper.
