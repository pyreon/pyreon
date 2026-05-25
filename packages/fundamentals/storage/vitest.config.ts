import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  // Branch threshold lowered: isBrowser()/typeof indexedDB checks
  // always evaluate to true in happy-dom, making SSR branches uncoverable.
  coverageThresholds: { branches: 85 },
})
