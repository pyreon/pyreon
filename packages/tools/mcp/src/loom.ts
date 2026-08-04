/**
 * Dependency-fabric support for the MCP server.
 *
 * `loom scan` writes `loom-report.json` — the workspace graph, the external
 * version-usage map, and a detector-driven issue list with stable codes and
 * honest severities. Nothing served it. An assistant could ask what components
 * exist (`get_atlas_catalog`) but not what the packages are, what depends on
 * what, or what is wrong with the fabric — so questions like "is it safe to
 * change @scope/core?" got answered from a `package.json` read at best.
 *
 * ── Why this reads a FILE rather than importing @pyreon/loom ───────────────
 *
 * Same reasoning as `atlas.ts`, and it holds for an extra reason here: loom's
 * analysis is synchronous but its scan walks every file in the workspace, so
 * importing and re-running it inside a tool call would make every question pay
 * for a full scan. Reading the artifact keeps the tool cheap, keeps the server
 * working against a report produced by a different loom version, and degrades
 * to "run `loom scan`" instead of a resolution error.
 *
 * ── The honesty rule this module exists to hold ───────────────────────────
 *
 * Loom reads DECLARED truth — manifests and source imports, never a lockfile
 * or the registry. So the report can say a dependency is declared and cannot
 * say which version is installed, and its `unused-dep` findings are lexical
 * evidence rather than proof. Every rendering below carries that through,
 * because an agent that reads "unused" as "safe to delete" will delete a
 * package a bin loads at runtime.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

const REPORT_FILENAME = 'loom-report.json'

/** The subset of the report this server renders. Loom owns the full shape. */
export interface LoomReportShape {
  model?: { packages?: { name: string; version?: string; private?: boolean; deps?: { name: string; field?: string }[] }[] }
  graph?: {
    depths?: Record<string, number>
    cycles?: string[][]
    /** `[from, to]` tuples — loom's on-disk shape, not objects. */
    edges?: [string, string][]
    reach?: Record<string, number>
  }
  issues?: {
    code: string
    severity: 'error' | 'warning' | 'info'
    pkg: string
    dep?: string
    message: string
  }[]
  stats?: Record<string, number>
}

export const MISSING_REPORT_MESSAGE = [
  'No `loom-report.json` found in this project (searched up from the current directory).',
  '',
  'Generate it with:',
  '',
  '    npx @pyreon/loom scan .        # or: pyreon loom scan .',
  '',
  'The report is a build artifact, so this tool reports its absence rather than',
  'guessing at a dependency graph — a guessed graph is worse than none.',
].join('\n')

/** Walk up for the report, like a package manager looking for a root. */
export function findReportPath(startDir: string): string | undefined {
  let dir = startDir
  for (let i = 0; i < 30; i += 1) {
    const candidate = join(dir, REPORT_FILENAME)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

export type LoadReportResult =
  | { ok: true; report: LoomReportShape; path: string; ageDays: number }
  | { ok: false; reason: 'missing' | 'unreadable'; detail?: string }

export function loadReport(startDir: string): LoadReportResult {
  const path = findReportPath(startDir)
  if (!path) return { ok: false, reason: 'missing' }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as LoomReportShape
    if (!parsed || typeof parsed !== 'object' || !parsed.model?.packages) {
      return { ok: false, reason: 'unreadable', detail: 'no `model.packages`' }
    }
    // Staleness is surfaced, never silently tolerated: the fabric changes with
    // every dependency edit, and a month-old graph answers confidently wrong.
    const ageDays = Math.floor((Date.now() - statSync(path).mtimeMs) / 86_400_000)
    return { ok: true, report: parsed, path, ageDays }
  } catch (err) {
    return { ok: false, reason: 'unreadable', detail: String(err) }
  }
}

const DECLARED_TRUTH_NOTE =
  'Loom reads DECLARED truth — manifests + source imports. It cannot tell you which version is ' +
  'INSTALLED (no lockfile, no registry), and `unused-dep` is lexical evidence, not proof: bins, ' +
  'plugin autoloads and CSS imports load without an import statement.'

function staleness(ageDays: number): string {
  if (ageDays <= 1) return ''
  return `\n> The report is ${ageDays} day(s) old — re-run \`loom scan\` if dependencies changed since.\n`
}

/** Overview: shape, cycles, the worst findings, and the widest blast radius. */
export function renderFabricOverview(report: LoomReportShape, ageDays: number): string {
  const pkgs = report.model?.packages ?? []
  const issues = report.issues ?? []
  const cycles = report.graph?.cycles ?? []
  const stats = report.stats ?? {}
  const bySeverity = (s: string) => issues.filter((i) => i.severity === s)

  const lines: string[] = []
  lines.push(`# Dependency fabric — ${pkgs.length} workspace package(s)`)
  lines.push('')
  lines.push(staleness(ageDays).trim())
  lines.push(
    `- internal edges: ${stats.edges ?? report.graph?.edges?.length ?? 0} · max depth: ${stats.depth ?? 0} · external deps: ${stats.external ?? 0}`,
  )
  lines.push(
    `- findings: ${bySeverity('error').length} error · ${bySeverity('warning').length} warning · ${bySeverity('info').length} info`,
  )
  lines.push('')

  if (cycles.length > 0) {
    lines.push(`## Runtime cycles (${cycles.length})`)
    // Dev edges are excluded by loom on purpose — shared test utilities
    // legitimately cycle both ways, so reporting them would be crying wolf.
    for (const c of cycles.slice(0, 10)) lines.push(`- ${c.join(' → ')}`)
    lines.push('')
  }

  const gating = [...bySeverity('error'), ...bySeverity('warning')]
  if (gating.length > 0) {
    lines.push(`## Gating findings (${gating.length})`)
    for (const i of gating.slice(0, 25)) {
      lines.push(`- **${i.severity}** \`${i.code}\` — ${i.pkg}${i.dep ? ` → ${i.dep}` : ''}`)
    }
    if (gating.length > 25) lines.push(`- …and ${gating.length - 25} more`)
    lines.push('')
  }

  const reach = report.graph?.reach ?? {}
  const ranked = Object.entries(reach)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
  if (ranked.length > 0) {
    lines.push('## Blast radius — changing these reaches the most packages')
    for (const [name, n] of ranked) lines.push(`- ${name} → ${n} dependent(s)`)
    lines.push('')
  }

  lines.push(`> ${DECLARED_TRUTH_NOTE}`)
  return lines.filter((l, idx, arr) => !(l === '' && arr[idx - 1] === '')).join('\n')
}

/** One package: what it needs, what needs it, and what is wrong with it. */
export function renderPackageFabric(
  report: LoomReportShape,
  name: string,
  ageDays: number,
): string {
  const pkgs = report.model?.packages ?? []
  const pkg = pkgs.find((p) => p.name === name)
  if (!pkg) {
    const near = pkgs
      .map((p) => p.name)
      .filter((n) => n.includes(name) || name.includes(n))
      .slice(0, 5)
    return [
      `No workspace package named \`${name}\` in the report.`,
      near.length > 0 ? `\nDid you mean: ${near.map((n) => `\`${n}\``).join(', ')}?` : '',
      '\nCall this tool with no `package` argument for the full list.',
    ].join('')
  }

  const edges = report.graph?.edges ?? []
  const dependents = edges.filter(([, to]) => to === name).map(([from]) => from)
  const issues = (report.issues ?? []).filter((i) => i.pkg === name)

  const lines: string[] = [`# ${name}${pkg.private ? ' (private)' : ''}`, '']
  const st = staleness(ageDays).trim()
  if (st) lines.push(st, '')
  lines.push(`- version: ${pkg.version ?? '—'}`)
  lines.push(`- depth: ${report.graph?.depths?.[name] ?? 0}`)
  lines.push(`- blast radius: ${report.graph?.reach?.[name] ?? 0} dependent(s)`)
  lines.push('')

  const runtimeDeps = (pkg.deps ?? []).filter((d) => d.field !== 'devDependencies')
  if (runtimeDeps.length > 0) {
    lines.push(`## Declares (${runtimeDeps.length} runtime)`)
    lines.push(runtimeDeps.map((d) => `\`${d.name}\``).join(', '))
    lines.push('')
  }
  if (dependents.length > 0) {
    lines.push(`## Depended on by (${dependents.length})`)
    lines.push(dependents.map((d) => `\`${d}\``).join(', '))
    lines.push('')
  }
  if (issues.length > 0) {
    lines.push(`## Findings (${issues.length})`)
    for (const i of issues) lines.push(`- **${i.severity}** \`${i.code}\` — ${i.message}`)
    lines.push('')
  }
  lines.push(`> ${DECLARED_TRUTH_NOTE}`)
  return lines.join('\n')
}
