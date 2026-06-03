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
  coverageThresholds: { statements: 95, lines: 95, branches: 95 },
})
