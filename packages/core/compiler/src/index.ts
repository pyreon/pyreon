// @pyreon/compiler — JSX reactive transform for Pyreon

export type { CompilerWarning, TransformResult } from './jsx'
export { transformJSX, transformJSX_JS } from './jsx'
export type { ComponentInfo, IslandInfo, ProjectContext, RouteInfo } from './project-scanner'
export { generateContext } from './project-scanner'
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
  AuditFormatOptions,
  AuditRisk,
  TestAuditEntry,
  TestAuditResult,
} from './test-audit'
export { auditTestEnvironment, formatTestAudit } from './test-audit'
