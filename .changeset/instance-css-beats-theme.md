---
'@pyreon/styler': minor
'@pyreon/elements': minor
---

A typed per-instance style override, `styles`, on `Element` and `Text`; it beats the component's own `.theme()`. The `css` prop no longer accepts a raw CSS string.

`styles` takes the same object a component's `.theme()` returns: unistyle property names (a misspelt key is a type error), each value a single value, a mobile-first array or a breakpoint object, numbers converted to rem, and `hover` / `focus` / `active` / `disabled` groups rendered as `:hover` / `:focus-visible` / `:active` / `:disabled, [aria-disabled='true']`. A `(theme, mode) => object` callback works too and follows the colour mode. There are no selectors and no CSS text: an override styles only the element it is on.

```tsx
const Grid = el.config({ name: 'Grid' }).attrs({ block: true })
  .theme(() => ({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' }))

// Three columns from md. Before, `css` lost to the theme's single column.
<Grid styles={{ gridTemplateColumns: { md: 'repeat(3, minmax(0, 1fr))' } }} />
```

The framework's cascade-layer order is now `@layer elements, rocketstyle, instance;` (was `elements, rocketstyle`). `styles`, and the `css` / `contentCss` / `beforeContentCss` / `afterContentCss` escape hatches, render into the new `instance` layer, so the value passed at the call site wins over the theme, pseudo-states included. Equal `styles` content shares one class; a signal-driven or callback `styles` swaps the class on the same element without a remount.

Breaking:
- `css` (and the slot `*Css` props) no longer type a raw string. Use `styles`, or write the escape hatch as a tagged template: `css={css`…`}` or `css={(css) => css`…`}`. A raw string still renders for untyped callers, with a one-time dev warning.
- Where an app relied on the theme beating an instance `css`, or on an instance `css` losing to an Element's responsive layout prop at a breakpoint, the instance value now wins in both cases. Unlayered CSS still beats every layer. If your HTML declares its own layer order with the framework's names (for example `@layer base, elements, rocketstyle, overrides;`), add `instance` after `rocketstyle`.

`@pyreon/styler`: a NAMED `@layer <name> { … }` block written inside a styled component's CSS now goes into the top-level layer `<name>` under the same class, instead of becoming a sublayer of the component's own `layer` option (a block nested in a block is the dotted sublayer; anonymous blocks are unchanged). The order statement is still emitted exactly once per sheet, and class names are unchanged by layering, so SSR and client output agree.
