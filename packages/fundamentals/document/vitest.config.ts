import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  // PDF + DOCX renderers excluded from node-side coverage —
  // they emit real binary output via pdfmake / docx libs and the
  // format-specific branches need a real binary-fixture harness
  // (snapshot of byte ranges). The render() pipeline calling into
  // them is covered by render.test.ts using a stub renderer.
  coverageExclude: ['src/renderers/pdf.ts', 'src/renderers/docx.ts'],
  // Hardened to ~100% across all four metrics (2026-06). Every lighter
  // renderer (HTML/MD/text/CSV/SVG/email/chat) is exhaustively tested via
  // src/tests/coverage-gaps.test.ts; the binary renderers (PPTX/XLSX) run
  // their real pptxgenjs/exceljs paths plus mocked missing-dependency
  // throws (missing-deps.test.ts) and a server-env download guard
  // (download-server.test.ts). The only suppressed branches are
  // noUncheckedIndexedAccess `?? fallback` guards on provably-in-bounds
  // indices, all marked `/* v8 ignore */` with inline rationale.
  // Threshold pinned 1pt below the achieved 100% for measurement headroom.
  coverageThresholds: { statements: 99, branches: 99, functions: 99, lines: 99 },
})
