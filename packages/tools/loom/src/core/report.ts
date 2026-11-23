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
import type { LoomIgnore, LoomIssue, LoomReport } from './types'
import type { LoomSettings } from './config'

export interface BuildReportOptions {
  /** Skip the source-import scan (phantom / dev-dep / unused detectors). */
  noImports?: boolean
  /**
   * Settings resolved from `pyreon.config.*` + the root manifest.
   *
   * Passed IN rather than read here: loading a config module is async and
   * `buildReport` is a pure synchronous function of (workspace, options),
   * which is what makes it testable without a filesystem full of config.
   */
  settings?: Partial<LoomSettings>
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const

/** Codes only the source-import scan produces — absent under `--no-imports`. */
const LEXICAL_CODES: ReadonlySet<string> = new Set(['phantom-dep', 'phantom-type-dep', 'prod-import-of-dev-dep', 'unused-dep'])

function ignoreMatches(ig: LoomIgnore, issue: LoomIssue): boolean {
  return (
    (ig.pkg === undefined || ig.pkg === issue.pkg) &&
    (ig.dep === undefined || ig.dep === issue.dep) &&
    (ig.code === undefined || ig.code === issue.code)
  )
}

/**
 * A `loom.ignore` entry that suppressed nothing in this scan. The defect it
 * excused is gone (or never matched: a typo in `pkg` / `dep` / `code`), so the
 * entry now only hides the NEXT finding that happens to fit it — and its
 * reason, which nobody re-reads, is no longer true. Reported as a warning by
 * default (so `--strict` gates it; `loom.severity` can change that). Under `--no-imports` an entry that
 * could match a lexical finding is not judged: those detectors did not run.
 */
function staleIgnores(
  ignores: readonly LoomIgnore[],
  used: ReadonlySet<LoomIgnore>,
  noImports: boolean,
  severity: LoomIssue['severity'],
): LoomIssue[] {
  const out: LoomIssue[] = []
  for (const ig of ignores) {
    if (used.has(ig)) continue
    if (noImports && (ig.code === undefined || LEXICAL_CODES.has(ig.code))) continue
    const target = [ig.code ?? 'any code', ig.pkg ? `in \`${ig.pkg}\`` : 'in any package', ig.dep ? `for \`${ig.dep}\`` : '']
      .filter(Boolean)
      .join(' ')
    out.push({
      code: 'stale-ignore',
      severity,
      pkg: ig.pkg ?? 'ROOT',
      ...(ig.dep !== undefined ? { dep: ig.dep } : {}),
      message: `A \`loom.ignore\` entry (${target}) matched no finding — what it excused is gone or it never matched; delete it, or fix its pkg / dep / code (reason: ${ig.reason})`,
      details: { entry: ig },
    })
  }
  return out
}

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
    const devPaths = options.settings?.devPaths ?? model.root.devPaths
    const imports = scanImports(rootDir, model.packages, devPaths)
    issues.push(...detectPhantoms(model, imports), ...detectUnused(model, imports))
  }
  // Per-code severity overrides run BEFORE suppressions so an `ignore` still
  // has the last word — a project that explicitly waved one finding through
  // should not have it resurrected by a blanket severity raise.
  const severityOverrides = options.settings?.severity
  if (severityOverrides) {
    for (const issue of issues) {
      const level = severityOverrides[issue.code]
      if (level) issue.severity = level
    }
  }

  const allIgnores = options.settings?.ignores?.length
    ? options.settings.ignores
    : model.root.ignores
  // Suppressions downgrade to info WITH the reason attached — a finding is
  // never silently dropped, and the report shows what was waved through.
  const used = new Set<LoomIgnore>()
  for (const issue of issues) {
    if (issue.severity === 'info') continue
    const match = allIgnores.find((ig) => ignoreMatches(ig, issue))
    if (match) {
      used.add(match)
      issue.severity = 'info'
      issue.message += ` (ignored: ${match.reason})`
      issue.ignored = match.reason
    }
  }
  issues.push(...staleIgnores(allIgnores, used, options.noImports === true, severityOverrides?.['stale-ignore'] ?? 'warning'))

  issues.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.code.localeCompare(b.code) || a.pkg.localeCompare(b.pkg),
  )

  const depthValues = Object.values(graph.depths)
  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.filter((i) => i.severity === 'warning').length
  const strict = options.settings?.strict === true
  return {
    model,
    external,
    graph,
    issues,
    gate: { strict, exit: errors > 0 || (strict && warnings > 0) ? 1 : 0 },
    stats: {
      internal: model.packages.length,
      external: external.length,
      edges: graph.edges.length,
      depth: depthValues.length ? Math.max(...depthValues) : 0,
      cycles: graph.cycles.length,
      errors,
      warnings,
      infos: issues.filter((i) => i.severity === 'info').length,
    },
  }
}
