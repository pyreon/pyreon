/** `@pyreon/loom/core` — model, scan, graph analysis, detectors, report. */
export type {
  DepField, DeclaredDep, WorkspacePackage, WorkspaceRoot, WorkspaceModel,
  ExternalUsage, IssueSeverity, IssueCode, LoomIssue, GraphAnalysis, LoomReport,
} from './types'
export { scanWorkspace, readWorkspaceGlobs } from './workspace'
export { analyzeGraph, externalUsage } from './graph'
export {
  majorOf, detectVersionDrift, detectInternalRange, detectCycles,
  detectPhantoms, detectUnused, detectPeerMismatch,
} from './detect'
export { specifierToPackage, isDevSurfacePath, scanPackageImports, scanImports } from './imports'
export type { ImportScan } from './imports'
export { buildReport } from './report'
export type { BuildReportOptions } from './report'
