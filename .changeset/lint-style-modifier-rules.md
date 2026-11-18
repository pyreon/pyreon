---
'@pyreon/lint': minor
---

Three styling rules for "no styles through props" (auto-gated on `@pyreon/elements`; 141 → 144 rules, `styling` 5 → 8):

- `pyreon/prefer-style-modifier` (warn, `recommended`): `css` on a component, in JSX or `h()`. The message names the `.multiple()` modifier to add, with the snippet built from the declarations of a plain `css` template (`Grid.multiple({ look: { gridTemplateColumns: 'repeat(3, 1fr)' } })` then `multiple="look"`). Not an autofix: the fix edits the component's definition and turns CSS text into unistyle keys. Skips HTML elements, `@pyreon/coolgrid` components and the slot props, which a root modifier cannot reach.
- `pyreon/no-raw-css-string` (error, `recommended`): raw CSS text (a string or an untagged template, also per breakpoint, in an array or through an `as` cast) in `css` / `contentCss` / `beforeContentCss` / `afterContentCss`, in JSX, `h()` or a `.attrs({ … })` object.
- `pyreon/no-theme-props-in-style` (warn, opt-in): an inline `style` on an `@pyreon/elements` / `@pyreon/ui-components` component, or a rocketstyle chain declared in the file, that fixes a layout or theme-owned property to a literal value. Computed values and custom properties are never flagged.
