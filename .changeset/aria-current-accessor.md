---
'@pyreon/core': patch
---

JSX type: `aria-current` now accepts a function accessor (`() => Booleanish | 'page' | 'step' | …`) for reactive values, matching the shape of `aria-selected` / `aria-disabled` / `aria-hidden`. Previously the type was static-value-only, forcing consumer code to cast with `as never` to use `aria-current={() => activeSlug() === h.slug ? 'location' : undefined}` (the canonical reactive-attr shape across Pyreon components).
