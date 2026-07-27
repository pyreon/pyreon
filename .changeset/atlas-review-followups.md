---
'@pyreon/ui-core': patch
'@pyreon/rocketstyle': patch
---

Accept an ACCESSOR for `<PyreonUI theme>`, and type rocketstyle dimension props to match their runtime.

**`@pyreon/ui-core`** — `theme` now accepts `PyreonTheme | (() => PyreonTheme)`, resolved inside the existing `enrichedTheme` computed so an accessor's signal reads stay tracked. This mirrors what `mode` already supported. It matters for any package that ships a PREBUILT lib compiled with the plain automatic JSX runtime (every `@pyreon` UI package does): there the compiler never wraps `theme={themeSignal()}` in `_rp()`, so the theme was read exactly once and a theme swap silently did nothing. Hand-wrapping in `_rp()` is not a workaround — in a compiled file the compiler wraps it a second time and `enrichTheme` receives a function.

**`@pyreon/rocketstyle`** — `ExtractDimensionProps` now also accepts an accessor per dimension prop (`state={() => cond ? 'a' : 'b'}`). `calculateStylingAttrs` has resolved function-valued dimension props since the inline-signal fix, but the type was never widened, so the very form that fix exists to support failed to typecheck. Applied only to the props-facing type, never to `ExtractDimensions` (the resolved `$$rocketstyle` shape, where a function is not a valid value). Widening only accepts more, so no existing call site changes.
