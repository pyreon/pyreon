---
"@pyreon/router": patch
---

Internal: satisfy `@pyreon/lint`'s `no-window-in-ssr` for the reduced-motion `matchMedia` guard added in the previous release. The inline `typeof matchMedia === 'function' && matchMedia(...)` check is refactored into a `prefersReducedMotion()` helper with an `if (typeof matchMedia === 'undefined') return false` entry guard (the form the rule recognises). No behavior change — SSR still returns false; the browser still reads `prefers-reduced-motion` per-navigation.
