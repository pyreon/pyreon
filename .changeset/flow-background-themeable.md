---
"@pyreon/flow": patch
---

fix(flow): `<Background>` pattern color is themeable + not overridable (dots readability)

The dot/line pattern color was set via the SVG `fill`/`stroke` **presentation attribute** with a hardcoded `#ddd` default — the same bug class the edge stroke already fixed. Two consequences: a `var()` couldn't be used (presentation attrs drop `var()`), so the pattern wasn't themeable and a light-`#ddd` grid was harsh/distracting on a dark canvas; and a global `svg { fill: … }` rule could override it (silently forcing the dots to the wrong color).

Now the pattern color is applied via `style` (CSS) — where `var()` resolves and inline style wins over a stylesheet rule — defaulting to the themeable `--pyreon-flow-bg-pattern` var (fallback `#ddd`). Set that var to dim the grid on a dark theme; an explicit `color` prop still wins. Light-mode default is unchanged (`#ddd`).
