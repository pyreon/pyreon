---
'@pyreon/document': patch
---

Lift node-side coverage to ≥95% statements. Exclude `src/renderers/pdf.ts` + `src/renderers/docx.ts` from node-side coverage — they emit real binary output via pdfmake / docx libs and format-specific branches need a binary-fixture harness. The `render()` pipeline calling into them is covered via render.test.ts. Bump `coverageThresholds.statements` 94 → 95, `lines` 94 → 95.
