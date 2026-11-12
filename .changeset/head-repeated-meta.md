---
'@pyreon/head': patch
---

`useHead` no longer collapses meta tags that share a name or property. `media` is part of a meta tag's key, so `theme-color` for light and dark both render, and a property repeated in one `useHead` call (`article:tag`, `og:locale:alternate`) renders every value instead of only the last. A later entry still replaces an earlier one's tag with the same key.
