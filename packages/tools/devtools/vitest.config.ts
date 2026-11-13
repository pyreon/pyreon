import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // Chrome-extension entry points run only inside the extension sandbox.
  // `panel-app.ts` (the panel UI) is driven by `panel.browser.test.ts` in
  // real Chromium against a real Pyreon app (layout, scrolling and
  // virtualisation do not exist in happy-dom); its data shaping lives in
  // tree.ts / reactive-view.ts / virtual.ts / hook.ts, which are measured.
  coverageExclude: [
    'src/background.ts',
    'src/content-script.ts',
    'src/devtools.ts',
    'src/page-hook.ts',
    'src/panel.ts',
    'src/panel-app.ts',
  ],
  coverageThresholds: {
    statements: 95,
    branches: 95,
    functions: 95,
    lines: 95,
  },
})
