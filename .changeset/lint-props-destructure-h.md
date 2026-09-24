---
'@pyreon/lint': patch
---

`pyreon/no-props-destructure` now recognises components that return `h(...)`, not only JSX. A PascalCase function whose return is an `h()` call is treated as a component, so a props destructure in hyperscript-authored components (library code that is not compiled) is flagged. camelCase helpers returning `h()` are still ignored. This is the gap that let `<RouterLink>`, `<Dynamic>` and three `@pyreon/a11y` components freeze their reactive props.
