---
'@pyreon/styler': minor
'@pyreon/elements': minor
---

The `css` escape hatch now beats the component's own `.theme()`, and it no longer accepts a raw CSS string.

There is no per-instance style prop: a one-off look is a named `.multiple()` modifier on the rocketstyle component (see `@pyreon/rocketstyle`). `css` stays for what a theme value cannot express, a selector or an at-rule, written as a tagged template (`css={css`…`}`) or a callback (`css={(css) => css`…`}`), per breakpoint or as an array.

The framework's cascade-layer order is now `@layer elements, rocketstyle, instance;` (was `elements, rocketstyle`). `Element`'s `css` / `contentCss` / `beforeContentCss` / `afterContentCss` and `Text`'s `css` render into the new `instance` layer, so the escape hatch wins over the theme, pseudo-classes included.

Breaking:
- `css` and the slot `*Css` props no longer type a raw string. Give the component a modifier for a look, or write the escape hatch as a tagged template. A raw string that a cast or an untyped `h()` call lets through still renders, with a one-time dev warning.
- Where an app relied on the theme beating an instance `css`, or on an instance `css` losing to an Element's responsive layout prop at a breakpoint, the instance `css` now wins in both cases. Unlayered CSS still beats every layer. If your HTML declares its own layer order with the framework's names (for example `@layer base, elements, rocketstyle, overrides;`), add `instance` after `rocketstyle`.

`@pyreon/styler`: a NAMED `@layer <name> { … }` block written inside a styled component's CSS now goes into the top-level layer `<name>` under the same class, instead of becoming a sublayer of the component's own `layer` option (a block nested in a block is the dotted sublayer; anonymous blocks are unchanged). The order statement is still emitted exactly once per sheet, and class names are unchanged by layering, so SSR and client output agree.
