---
'@pyreon/core': patch
'@pyreon/a11y': patch
---

Signal-driven props now stay live on `<Dynamic>`, `<VisuallyHidden>`, `<LiveRegion>` and `<SkipLink>`. Each destructured its props, which reads every getter-backed prop once at setup: the documented `<Dynamic component={components[current()]} />` never switched component, and forwarded attributes (and `LiveRegion`'s `politeness`, `SkipLink`'s `href`) froze at their first value. They now use `splitProps`/`mergeProps`. A static `component` on `<Dynamic>` still renders a plain node; a reactive one renders through an accessor so a change remounts the new component (SSR and hydration verified).
