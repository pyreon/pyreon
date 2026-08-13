import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // The TipTap-backed mount + editor instance are exercised by the
  // real-Chromium browser suite (TipTap/ProseMirror need a real DOM);
  // node coverage focuses on the pure helpers (bind-signal, extensions).
  // src/webview-entry.ts is a browser-only bundle ENTRY (mounts the editor
  // inside a WebView) — it runs only when bundled + hosted, so it has no unit
  // surface; the bundle pipeline is verified by @pyreon/test-utils'
  // webview-bundle-build test.
  coverageExclude: ['src/components/**', 'src/editor.ts', 'src/webview-entry.ts'],
  coverageThresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
})
