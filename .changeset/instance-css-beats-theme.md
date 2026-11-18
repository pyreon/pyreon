---
'@pyreon/styler': minor
'@pyreon/elements': minor
---

A per-instance `css` prop now beats the component's own `.theme()` for the same property.

The framework's cascade-layer order is now `@layer elements, rocketstyle, instance;` (was `elements, rocketstyle`). `Element`'s `css` / `contentCss` / `beforeContentCss` / `afterContentCss` and `Text`'s `css` render into the new `instance` layer, so on a rocketstyle component the value passed at the call site wins over the theme, pseudo-classes included:

```tsx
const Grid = el.config({ name: 'Grid' }).attrs({ block: true })
  .theme(() => ({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' }))

// Three columns from 768px. Before, the theme's single column won.
<Grid css="@media (min-width: 768px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }" />
```

Breaking where an app relied on the theme beating an instance `css`, or on an instance `css` losing to an Element's responsive layout prop at a breakpoint: the instance `css` now wins in both cases. Unlayered CSS still beats every layer. If your HTML declares its own layer order with the framework's names (for example `@layer base, elements, rocketstyle, overrides;`), add `instance` after `rocketstyle`.

`@pyreon/styler`: a NAMED `@layer <name> { … }` block written inside a styled component's CSS now goes into the top-level layer `<name>` under the same class, instead of becoming a sublayer of the component's own `layer` option (a block nested in a block is the dotted sublayer; anonymous blocks are unchanged). The order statement is still emitted exactly once per sheet, and class names are unchanged by layering, so SSR and client output agree.
