---
'@pyreon/unistyle': minor
---

CPSE: responsive values in `cpseStyled`

`cpseStyled`'s `styles` prop now accepts responsive values — mobile-first
arrays (`padding={[8, 16]}`) and breakpoint objects (`padding={{ sm: 16 }}`).
Each breakpoint emits a suffixed value-agnostic rule (`padding:
var(--u-<hash>-sm)`) wrapped in its `@media` query (via `createMediaQueries`;
the styler's `splitAtRules` hoists the nesting), and the instance sets every
breakpoint's value inline. The class stays value-agnostic (shared across
instances of the same shape); the browser's `@media` cascade selects the active
var — so responsive styling keeps CPSE's O(1)-rules property AND its
zero-`styler.resolve`-on-value-change dynamic behaviour. Breakpoints come from
`theme.breakpoints` (via the styler theme context), falling back to a default
xs/sm/md/lg/xl set, or an explicit `breakpoints` prop.

New exported types: `ResponsiveValue<T>`, `ResponsiveStyleTheme`.

Proven: unit tests (array/object expansion → per-breakpoint inline vars, shared
class across distinct values, custom breakpoints) + a real-Chromium e2e
(`ssr-showcase /cpse-probe`) that resizes the viewport and asserts the computed
padding flips across the breakpoint (400px→8px, 900px→48px) — bisect-verified
(removing the `@media` wrap makes the larger value win at all viewports).
