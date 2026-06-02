---
'@pyreon/elements': patch
---

Lift node-side coverage to ≥95% statements / ≥80% branches. Add Portal SSR-branch test (returns null when document undefined, line 34). Exclude `src/Text/styled.ts` + `src/helpers/Content/styled.ts` from node-side coverage — their `makeItResponsive` theme callbacks need real component-mount layout (covered by `elements.browser.test.tsx` + ui-showcase e2e). Bump `coverageThresholds.statements` 94 → 95, `branches` 76 → 80, `lines` 94 → 95.
