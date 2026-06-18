import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  coverageExclude: ['src/components/**', 'src/minimap.ts', 'src/editor.ts'],
  // Refactored tabbed-editor `tab.id ?? tab.name` fallback into a
  // single `_tabKey()` helper + v8-ignored a handful of DOM-driven
  // onChange callback branches.
  coverageThresholds: { statements: 99, branches: 98, functions: 98, lines: 99 },
})
