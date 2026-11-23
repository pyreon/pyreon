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
 * Suppressions downgrade to info WITH the reason attached — a finding is never
 * silently dropped, and the report shows what was waved through. The FIRST
 * matching entry applies, to findings that are not already info.
 */
function applyIgnores(issues: LoomIssue[], ignores: readonly LoomIgnore[]): void {
  for (const issue of issues) {
    if (issue.severity === 'info') continue
    const match = ignores.find((ig) => ignoreMatches(ig, issue))
    if (!match) continue
    issue.severity = 'info'
    issue.message += ` (ignored: ${match.reason})`
    issue.ignored = match.reason
  }
}

/** How an entry describes itself in a message. */
function describeIgnore(ig: LoomIgnore): string {
  return [ig.code ?? 'any code', ig.pkg ? `in \`${ig.pkg}\`` : 'in any package', ig.dep ? `for \`${ig.dep}\`` : '']
    .filter(Boolean)
    .join(' ')
}

/** Whether entry `index` matches anything, matches nothing, or is shadowed by an earlier entry. */
function ignoreVerdict(
  ig: LoomIgnore,
  index: number,
  ignores: readonly LoomIgnore[],
  matchable: readonly LoomIssue[],
): 'live' | 'gone' | { shadowedBy: LoomIgnore } {
  const matched = matchable.filter((issue) => ignoreMatches(ig, issue))
  if (matched.length === 0) return 'gone'
  const earlier = ignores.slice(0, index)
  const firsts = matched.map((issue) => earlier.find((e) => ignoreMatches(e, issue)))
  const first = firsts[0]
  if (first === undefined || firsts.some((f) => f === undefined)) return 'live'

  return { shadowedBy: first }
}

/**
 * `loom.ignore` entries that do nothing in this scan.
 *
 * - **Stale**: the entry matches NO finding, at any severity. The defect it
 *   excused is gone (or a typo in `pkg` / `dep` / `code` means it never
 *   matched); left in place it hides the next finding that happens to fit it,
 *   under a reason nobody re-reads. A finding that is `info` still counts as
 *   matched — an `unused-dep`, a private package's finding, or a code lowered
 *   with `loom.severity` while it is burned down all keep their entries live.
 * - **Shadowed**: every finding it matches is also matched by an EARLIER entry,
 *   which is the one that applies. It is redundant, not gone.
 *
 * Judged against the findings BEFORE suppression (`matchable`), so neither the
 * info-skip nor the first-match rule decides it. Reported as a warning by
 * default (so `--strict` gates it; `loom.severity` can change that). Under
 * `--no-imports` an entry that could match a lexical finding is not judged:
 * those detectors did not run.
 */
function unusedIgnores(
  ignores: readonly LoomIgnore[],
  matchable: readonly LoomIssue[],
  opts: { noImports: boolean; severity: LoomIssue['severity']; declaredIn: string },
): LoomIssue[] {
  const out: LoomIssue[] = []
  ignores.forEach((ig, index) => {
    if (opts.noImports && (ig.code === undefined || LEXICAL_CODES.has(ig.code))) return
    const verdict = ignoreVerdict(ig, index, ignores, matchable)
    if (verdict === 'live') return
    const shadowedBy = verdict === 'gone' ? undefined : verdict.shadowedBy
    const message = shadowedBy
      ? `A \`loom.ignore\` entry (${describeIgnore(ig)}) is shadowed: every finding it matches is already matched by an earlier entry (${describeIgnore(shadowedBy)}), which is the one that applies; delete it, or move it above that entry (reason: ${ig.reason})`
      : `A \`loom.ignore\` entry (${describeIgnore(ig)}) matched no finding — what it excused is gone, or it never matched; delete it, or fix its pkg / dep / code (reason: ${ig.reason})`
    out.push({
      code: 'stale-ignore',
      severity: opts.severity,
      pkg: ig.pkg ?? 'ROOT',
      ...(ig.dep !== undefined ? { dep: ig.dep } : {}),
      message,
      details: { entry: ig, declaredIn: opts.declaredIn, ...(shadowedBy ? { shadowedBy } : {}) },
    })
  })

  return out
}

/** The ignore entries in force and the file they were declared in. */
function ignoreSource(
  options: BuildReportOptions,
  rootIgnores: readonly LoomIgnore[],
): { ignores: readonly LoomIgnore[]; declaredIn: string } {
  const fromSettings = options.settings?.ignores
  if (fromSettings && fromSettings.length > 0) {
    return { ignores: fromSettings, declaredIn: options.settings?.ignoresFrom ?? 'package.json' }
  }

  return { ignores: rootIgnores, declaredIn: 'package.json' }
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

  const { ignores: allIgnores, declaredIn } = ignoreSource(options, model.root.ignores)
  const matchable = [...issues]
  applyIgnores(issues, allIgnores)
  issues.push(
    ...unusedIgnores(allIgnores, matchable, {
      noImports: options.noImports === true,
      severity: severityOverrides?.['stale-ignore'] ?? 'warning',
      declaredIn,
    }),
  )

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
