---
'@pyreon/rocketstyle': minor
---

A one-off look is a named, typed `.multiple()` modifier, and that now works for every value a `.theme()` takes:

```tsx
const Grid = BaseGrid.multiple({
  threeUp: { gridTemplateColumns: { md: 'repeat(3, minmax(0, 1fr))' } },
  dense: { gap: 8 },
})

<Grid multiple={['threeUp', compact() && 'dense']} />
```

- **Responsive slices win from their first breakpoint up.** Theme layers (chained `.theme()` calls, then the active dimension slices) used to be deep-merged, so a slice `{ md: … }` over a theme's single value replaced it (nothing below `md`), and over a theme's `{ xs: …, lg: … }` it lost at `lg`. A responsive value now overrides from its first defined breakpoint up and keeps the earlier value below it; a single value still replaces everything. Without `theme.breakpoints` the merge is unchanged.
- **Mobile-first arrays survive the light/dark resolution.** `getThemeByMode` turned `[4, 8]` into `{ 0: 4, 1: 8 }`, which unistyle read as a breakpoint map without breakpoints and dropped, in `.theme()` and in every dimension. Arrays stay arrays, with `mode()` pairs inside them resolved.
- **Falsy entries in a multi-dimension list are skipped** (`multiple={['threeUp', cond && 'dense']}`), at runtime and in the types, so the memo and class are those of the list without them.
- **Dimension slices are typed like a theme.** A slice value accepts a single value, a mobile-first array or a breakpoint object, and the `hover` / `focus` / `active` / `disabled` / `pressed` / `readOnly` groups (one level). With a typed `StylesDefault` its keys are still checked, so a misspelt property is an error. Only accepts more than before.

Behaviour change: a responsive dimension value over a theme value now keeps the theme's value below its first breakpoint, and drops the theme's own breakpoints at or above it, where it used to replace or lose to them.
