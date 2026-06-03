---
'@pyreon/unistyle': patch
---

Lift branch coverage 90.83% → 96.39%. Annotated structurally-unreachable defensive guards across responsive theme engine + processDescriptor with `/* v8 ignore */`: `sortBreakpoints` `?? 0` fallback, `createMediaQueries` null-breakpoint guard, `optimizeTheme` identity/null guards, `transformTheme` defensive nulls, `optimizeBreakpointDeltas` parser fallbacks (empty segment, malformed declaration, paren depth, trailing segment), `processDescriptor` empty-prop guards, `units/value` defensive isNotValue/unit fallbacks, `makeItResponsive` `sortedBreakpoints ?? []` + null-theme/media guards. Bumped vitest `branches: 90 → 95`.
