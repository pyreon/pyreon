// `@pyreon/compiler/audits` — the `pyreon doctor` audits and the project
// scanner (`pyreon context` / `.pyreon/context.json`). Most parse with the
// TypeScript compiler API, so none of it is in the main entry (see `index.ts`).
export type { ComponentInfo, IslandInfo, ProjectContext, RouteInfo } from './project-scanner'
export { generateContext } from './project-scanner'
export type {
  AuditFormatOptions,
  AuditRisk,
  TestAuditEntry,
  TestAuditOptions,
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
