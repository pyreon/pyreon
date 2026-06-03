---
'@pyreon/hooks': patch
---

Lift branches coverage 83.25% → 85.16%. Add 5 SSR-fallback tests (useThemeValue no-context, useOnline SSR, useEventListener SSR no-op, useClipboard SSR + clipboard-rejection). Bump `branches` threshold 75 → 85, `lines` 94 → 95. **Removes** the BELOW_FLOOR_EXEMPTIONS entry — package now meets all floors.
