---
"@pyreon/hooks": minor
---

`useMediaQuery('(prefers-color-scheme: dark)')` and its `light` twin now lower to iOS and Android as a boolean read of the system appearance. Any other query (width, orientation, `prefers-reduced-motion`, a computed query) is a named warning that drops the hook, because natively those questions are answered in window size classes, not CSS pixels; use `useSizeClass()` or `useReducedMotion()`.
