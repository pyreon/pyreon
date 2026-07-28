---
'@pyreon/native-compiler': patch
---

A rocketstyle dimension written as an object of FUNCTIONS dropped every style,
silently.

rocketstyle takes ONE callback returning the whole map —
`.sizes((t) => ({ small: { … } }))`. The per-value form,
`.sizes({ small: () => ({ width: 120 }) })`, reads just as naturally and is a
documented footgun (`anti-patterns.md` records that it "produces EMPTY
dimension themes"), but the native emit reported nothing at all:
`objectExprToStyleObject` returns `{}` for anything that is not an object
literal, so the styles vanished without a diagnostic.

A `size="large"` app therefore compiled, ran, and rendered unstyled.

It now warns per dropped value, on both targets, naming the component, the
dimension and the value — and quoting the correct shape, because a warning that
names the problem without the fix just relocates the confusion. The component
still emits and still applies its `.theme()` base: a dimension typo should not
take the screen down, and the warning is what makes the loss visible.

Found by writing the first rocketstyle app for a native target and reading the
emit. Nothing had, which is why the capability matrix now carries a
`Styling & design system` row at an R4 fraction of 0.0.

Bisect-verified: removing the warning fails 3 of the 6 specs.
