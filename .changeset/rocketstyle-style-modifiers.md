---
'@pyreon/rocketstyle': minor
---

New `.params()` for caller-chosen values, and a one-off look as a named, typed `.multiple()` modifier now works for every value a `.theme()` takes.

```tsx
const Grid = el.config({ name: 'Grid' })
  .theme(() => ({ display: 'grid' }))
  .params({
    columns: (n: number) => ({ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }),
    pad: (step: 'small' | 'large', t) => ({ padding: t.spacing[step] }),
  })

<Grid columns={{ xs: 1, md: 3 }} pad="small" />
<Grid columns={cols()} />   // signal-driven: the class swaps on the same node
```

- **`.params(mappers)`**: each key becomes an optional prop typed from the mapper's first parameter and widened to the responsive forms (single value, mobile-first array, breakpoint object). The framework splits a responsive value per breakpoint; the mapper gets one value, the app theme and `mode`, and returns a theme slice (pseudo groups included). Params resolve into `$rocketstyle` with the dimension props, after state / size / variant and before `multiple`, and join the memo key by value, so equal values share one class. Param props are never forwarded. A later `.params()` overrides by name; a param named like a dimension or pseudo-state prop throws in development. `params` is now a reserved dimension name.
- **Native**: `.multiple()` / `.modifiers()` looks and `.params()` values are not lowered to iOS / Android yet. Each is now a named compile warning and its props are stripped at the use site (before: dropped silently, props passed to the primitive).

The modifier fixes:

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
