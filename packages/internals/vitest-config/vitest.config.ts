import { defineNodeConfig } from './src/node.ts'

// Dogfooding — this package's own tests use the helper it ships.
export default defineNodeConfig({
  category: 'internals',
  coverageThresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
})
