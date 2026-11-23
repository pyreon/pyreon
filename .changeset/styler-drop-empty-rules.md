---
'@pyreon/styler': patch
---

`styled()` and `useCSS` drop empty rule blocks from a component's CSS before hashing and inserting it. A state block written as `&:hover { ${maybeEmpty} }` used to leave `&:hover { }` in the stylesheet whenever that state had no styles; each one still cost the browser parsing, selector matching and style invalidation on every element with the class. On pyreon.dev's home page there were about 900 of them. A rule or `@media` that held only empty rules is dropped too; an empty `@layer name {}` stays (it declares layer order), and braces inside quoted strings are left alone. A component with an empty state block now gets the same class as one written without it.
