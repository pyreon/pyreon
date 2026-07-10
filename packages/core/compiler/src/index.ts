export type {
  DirectiveIsland,
  DirectiveWarning,
  HydrateStrategy,
  TransformClientDirectivesResult,
} from './client-directives'
export { transformClientDirectives } from './client-directives'
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
export { analyzeValidate, emitSchemaSource, emitValidator, isEmittable } from './validate-emit'
export type {
  NumberCheck,
  SchemaSourceResult,
  StringCheck,
  ValidateField,
  ValidateNode,
  ValidateSchemaInfo,
} from './validate-emit'
export type { LPIHFireDatum, LPIHMergeOptions } from './lpih'
export { firesToCreationSiteFindings, mergeFireDataIntoFindings } from './lpih'
// The @pyreon/zero fs-route convention — single source of truth shared by the
// project scanner (below) and `@pyreon/zero`'s fs-router/api-routes (which
// re-export it via the `@pyreon/compiler/fs-route-convention` subpath so they
// don't cold-load the whole compiler barrel).
export {
  apiFilePathToPattern,
  filePathToUrlPath,
  isApiRoute,
  ROUTE_EXTENSIONS,
  SPECIAL_ROUTE_FILES,
  stripRouteExtension,
} from './fs-route-convention'
// Island auto-name derivation — shared by `@pyreon/vite-plugin`'s
// injectIslandNames / scanIslandDeclarations and the project scanner.
export { deriveIslandName, fnv1a6, islandRelPath } from './island-naming'
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
  PyreonMigrationChange,
  PyreonMigrationResult,
  PyreonRemainingIssue,
} from './pyreon-migrate'
export { AUTO_FIXABLE_PYREON_CODES, migratePyreonCode } from './pyreon-migrate'
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
// `pyreon doctor --check-native` audit — multiplatform (PMTC) build hazards.
export type {
  NativeAuditResult,
  NativeFinding,
  NativeFindingCode,
  NativeLocation,
  NativePatternDiagnostic,
} from './native-audit'
export { auditNative, detectNativePatterns } from './native-audit'
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
