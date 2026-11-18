---
'@pyreon/server': patch
'@pyreon/compiler': patch
---

`hydrate: 'visible'` (and `prefetch: 'visible'`) now observes the first elements under an island that generate a box, walking through `display: contents` wrappers at any depth, so an island whose content starts under a nested `<PyreonUI mode>` scope hydrates when scrolled into view instead of never. An element hidden right now (`display: none`, a closed `<details>`) is still observed and hydrates when shown. A `display: contents` island that holds no element at all falls back to its nearest boxed ancestor and warns once in dev; `diagnose` explains the warning. Closes #4435.
