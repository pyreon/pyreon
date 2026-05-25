import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  // Branch threshold lowered: V8 counts both sides of ?? and ||
  // operators, plus typeof checks are always true in happy-dom.
  // PDF/DOCX renderers have many format-specific branches.
  // Floor-bumped 75 → 80 in PR #324 (actual 80.67%).
  coverageThresholds: { branches: 80 },
})
