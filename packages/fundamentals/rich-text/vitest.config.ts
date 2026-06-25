import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // The TipTap-backed mount + editor instance are exercised by the
  // real-Chromium browser suite (TipTap/ProseMirror need a real DOM);
  // node coverage focuses on the pure helpers (bind-signal, extensions).
  coverageExclude: ['src/components/**', 'src/editor.ts'],
  coverageThresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
})
