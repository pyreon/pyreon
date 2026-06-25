---
'@pyreon/zero': minor
---

font: `fallbackAdjust.applyTo` — zero-touch auto-binding of the size-adjusted font stack

`fallbackAdjust` now accepts an object form, `{ applyTo: 'body' | <selector> }`,
that writes the `font-family` binding for you so the plain-CSS path is
fully automatic — no need to add `var(--pyreon-font-<slug>)` to your own
CSS:

```ts
zero({
  font: {
    google: ['Ubuntu:wght@300;500'],
    fallbackAdjust: { applyTo: 'body' }, // → body { font-family: var(--pyreon-font-ubuntu) }
  },
})
```

`applyTo: true` is shorthand for `'body'`; any selector works
(`':root'`, `'.app'`, …). It binds the **first configured family**
(primary). Opt-in by design (auto-writing a global `font-family` is
opinionated); `fallbackAdjust: true` / default is unchanged (metrics +
the `--pyreon-font-<slug>` var, no binding).

This covers content that **inherits** `font-family`. Components styled
via the `@pyreon/ui-system` theme take their font from the theme, not the
cascade — point the theme at the **same variable** for those
(`fontFamily: { base: 'var(--pyreon-font-inter)' }`); styler passes
`var()` through verbatim. The two are complementary; one variable per
family drives both surfaces. Documented in
`docs/src/content/docs/images-and-fonts.md`.
