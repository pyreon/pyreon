---
'@pyreon/router': patch
---

`<RouterLink>` now forwards signal-driven attributes live. It destructured its props, which read every getter-backed prop once at setup, so a reactive `aria-label`, `title`, `class` or any other attribute on a link froze at its first value. It now carves its own props with `splitProps` and forwards the rest with `mergeProps`, keeping each attribute a live binding on the `<a>`.
