// @pyreon/compiler — JSX reactive transform for Pyreon

export type { DeferInlineResult, DeferInlineWarning } from './defer-inline'
export { transformDeferInline } from './defer-inline'
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
export type {
  IslandAuditFormatOptions,
  IslandAuditResult,
  IslandFinding,
  IslandFindingCode,
  IslandLocation,
} from './island-audit'
export { auditIslands, formatIslandAudit } from './island-audit'
// M3.4 — `pyreon doctor --check-ssg` audit.
export type {
  SsgAuditFormatOptions,
  SsgAuditResult,
  SsgFinding,
  SsgFindingCode,
  SsgLocation,
} from './ssg-audit'
export { auditSsg, formatSsgAudit } from './ssg-audit'
