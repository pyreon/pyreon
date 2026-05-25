import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  coverageExclude: ['src/components/**', 'src/minimap.ts', 'src/editor.ts'],
  // Branch threshold lowered: CodeMirror integration paths have many
  // editor-state branches unreachable in unit tests.
  coverageThresholds: { branches: 70 },
})
