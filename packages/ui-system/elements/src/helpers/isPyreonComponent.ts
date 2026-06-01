// Re-export of the canonical helper that now lives in `@pyreon/ui-core`.
// Kept here for backward compat with internal test files and any consumer
// that imported the helper from this path. The implementation lives at
// `@pyreon/ui-core/src/isPyreonComponent.ts` — see that file's JSDoc for
// the full rationale (tier-1 markers + tier-2 naming convention, bug
// class the discriminator closes).
export { isPyreonComponent } from '@pyreon/ui-core'
