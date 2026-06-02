import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  // Branch threshold lowered: typeof window/navigator checks always
  // evaluate to true in happy-dom, making SSR branches uncoverable.
  coverageThresholds: { statements: 95, branches: 75, lines: 94 },
})
