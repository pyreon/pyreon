// `@pyreon/compiler/analyze` — pattern detectors, codemods and the Reactivity
// Lens. All of it parses with the TypeScript compiler API, which is why it is
// NOT in the main entry (see `index.ts`).
export type {
  ErrorDiagnosis,
  MigrationChange,
  MigrationResult,
  ReactDiagnostic,
  ReactDiagnosticCode,
} from './react-intercept'
export {
  detectReactPatterns,
  diagnoseError,
  hasReactPatterns,
  migrateReactCode,
} from './react-intercept'
export type { PyreonDiagnostic, PyreonDiagnosticCode } from './pyreon-intercept'
export { detectPyreonPatterns, hasPyreonPatterns } from './pyreon-intercept'
export type {
  PyreonMigrationChange,
  PyreonMigrationResult,
  PyreonRemainingIssue,
} from './pyreon-migrate'
export { AUTO_FIXABLE_PYREON_CODES, migratePyreonCode } from './pyreon-migrate'
export type {
  AnalyzeReactivityResult,
  ReactivityFinding,
  ReactivityFindingKind,
} from './reactivity-lens'
export { analyzeReactivity, formatReactivityLens } from './reactivity-lens'
export type { LPIHFireDatum, LPIHMergeOptions } from './lpih'
export { firesToCreationSiteFindings, mergeFireDataIntoFindings } from './lpih'
