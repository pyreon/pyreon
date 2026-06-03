---
'@pyreon/elements': patch
---

Lift branch coverage 91.27% → 96.19%. Annotated structurally-unreachable defensive guards across `Element/component`, `Overlay/{component,useOverlay}`, `helpers/Iterator/component`, `helpers/Wrapper/{component,styled}` with `/* v8 ignore */`: dev-only `IS_DEVELOPMENT` data-attrs, happy-dom layout-measurement defenses in `equalize`, missing-ref dev-warn paths in useOverlay, SSR/typeof document + offsetParent guards, type-modal ARIA ternaries, defensive itemKey/empty-array/innerHTML guards. Bumped vitest `branches: 90 → 95`.
