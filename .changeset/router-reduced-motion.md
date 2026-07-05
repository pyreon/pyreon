---
"@pyreon/router": minor
---

Respect `prefers-reduced-motion` for route View Transitions (WCAG 2.3.3 "Animation from Interactions"). When the user's OS is set to reduce motion, the router now skips `document.startViewTransition()` and swaps the DOM synchronously via the existing non-VT path — the navigation still happens, only the fade/slide animation is suppressed. The preference is read per-navigation (not cached), so toggling it mid-session takes effect on the next route change. No configuration needed; `meta.viewTransition: false` still opts a route out entirely.
