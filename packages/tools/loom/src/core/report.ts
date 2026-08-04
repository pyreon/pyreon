/**
 * Report assembly — scan, analyze, detect, fold the stats. One entry point;
 * the CLI, the dev server, and tests all consume this.
 */
import { scanImports } from './imports'
import { analyzeGraph, externalUsage } from './graph'
import {
  detectCycles,
  detectInternalRange,
  detectPeerMismatch,
  detectPhantoms,
  detectUnused,
  detectVersionDrift,
} from './detect'
import { scanWorkspace } from './workspace'
import type { LoomIssue, LoomReport } from './types'

export interface BuildReportOptions {
  /** Skip the source-import scan (phantom / dev-dep / unused detectors). */
  noImports?: boolean
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const

export function buildReport(rootDir: string, options: BuildReportOptions = {}): LoomReport {
  const model = scanWorkspace(rootDir)
  const graph = analyzeGraph(model)
  const external = externalUsage(model)

  const issues: LoomIssue[] = [
    ...detectVersionDrift(external, model.root.overrides),
    ...detectInternalRange(model),
    ...detectCycles(graph),
    ...detectPeerMismatch(model),
  ]
  if (!options.noImports) {
    const imports = scanImports(rootDir, model.packages, model.root.devPaths)
    issues.push(...detectPhantoms(model, imports), ...detectUnused(model, imports))
  }
  // Suppressions downgrade to info WITH the reason attached — a finding is
  // never silently dropped, and the report shows what was waved through.
  for (const issue of issues) {
    if (issue.severity === 'info') continue
    const match = model.root.ignores.find(
      (ig) =>
        (ig.pkg === undefined || ig.pkg === issue.pkg) &&
        (ig.dep === undefined || ig.dep === issue.dep) &&
        (ig.code === undefined || ig.code === issue.code),
    )
    if (match) {
      issue.severity = 'info'
      issue.message += ` (ignored: ${match.reason})`
    }
  }

  issues.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.code.localeCompare(b.code) || a.pkg.localeCompare(b.pkg),
  )

  const depthValues = Object.values(graph.depths)
  return {
    model,
    external,
    graph,
    issues,
    stats: {
      internal: model.packages.length,
      external: external.length,
      edges: graph.edges.length,
      depth: depthValues.length ? Math.max(...depthValues) : 0,
      cycles: graph.cycles.length,
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
      infos: issues.filter((i) => i.severity === 'info').length,
    },
  }
}
