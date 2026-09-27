---
'@pyreon/rocketstyle': minor
---

Type theme callbacks locally with `rocketstyle(config).withTheme<Tokens>()`, and actually check them.

- `withTheme<Tokens>()` binds the theme type every `.theme()` and dimension callback built from the factory receives, so `t` is inferred and checked, with no global `declare module '@pyreon/rocketstyle'` augmentation. It is type-only and returns the same factory. An `interface` works directly.
- `.theme()` now checks its callback. Its object arm (`Partial<Record<string, unknown>>`) accepted any function, so every callback matched it and a wrong annotation on `t` compiled. **Type-level breaking:** a `.theme((t: X) => …)` whose annotation disagrees with the bound theme is now an error. Bind the factory with `withTheme<X>()` and drop the annotation.
- New exported types: `RocketstyleFactory`, `ThemeShape`, `ThemeObject`.
