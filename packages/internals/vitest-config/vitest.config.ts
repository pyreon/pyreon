import { defineNodeConfig } from './src/node.ts'

// Dogfooding — this package's own tests use the helper it ships.
// Internals category → 90/90/90/90 coverage thresholds (matches the
// pre-migration default the other internals packages had implicitly).
export default defineNodeConfig({ category: 'internals' })
