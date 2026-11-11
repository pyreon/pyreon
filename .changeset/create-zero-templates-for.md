---
'@pyreon/create-zero': patch
---

The starter templates render lists with `<For each by>` instead of `.map()` in JSX, so a fresh app passes its own `pyreon doctor` react-patterns gate (`array-map-jsx`) now that the gate no longer skips files whose only habit is `.map()`.
