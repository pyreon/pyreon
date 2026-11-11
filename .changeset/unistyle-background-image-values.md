---
'@pyreon/unistyle': patch
---

`backgroundImage` no longer wraps a value that is already a CSS image in `url()`. Gradients (including `repeating-*` and `conic-gradient`), `url()`, `image-set()`, `cross-fade()`, `element()`, `var()` / `env()`, `none` and the CSS-wide keywords now pass through verbatim, so `backgroundImage: 'linear-gradient(…)'` and mode-aware values under `cssVariables` render instead of computing to `none`. A bare path or URL still becomes `url(…)`, and each layer of a comma-separated list is handled on its own.
