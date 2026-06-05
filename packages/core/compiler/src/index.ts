export type { DeferInlineResult, DeferInlineWarning } from './defer-inline'
export { transformDeferInline } from './defer-inline'
export type {
  CompilerWarning,
  ReactivityKind,
  ReactivitySpan,
  TransformResult,
} from './jsx'
export { transformJSX, transformJSX_JS, rocketstyleCollapseKey, scanCollapsibleSites } from './jsx'
export type { CollapsibleSite, StaticChild, StaticChildNode } from './jsx'
export type {
  AnalyzeReactivityResult,
  ReactivityFinding,
  ReactivityFindingKind,
} from './reactivity-lens'
export { analyzeReactivity, formatReactivityLens } from './reactivity-lens'
export type { LPIHFireDatum, LPIHMergeOptions } from './lpih'
export { firesToCreationSiteFindings, mergeFireDataIntoFindings } from './lpih'
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
// PR 9 follow-up — `pyreon doctor --check-content` audit.
export type {
  AuditContentOptions,
  CollectionDecl,
  ContentAuditResult,
  ContentFinding,
  ContentFindingCode,
  ContentLocation,
} from './content-audit'
export {
  auditContent,
  deriveSlug,
  extractInternalLinks,
  findContentConfigs,
  formatContentFindings,
  parseContentConfig,
  readFrontmatter,
  readTitleFromFrontmatter,
} from './content-audit'
