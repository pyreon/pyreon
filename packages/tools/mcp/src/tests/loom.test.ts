/**
 * `get_dependency_fabric` — serving loom's report to an agent.
 *
 * The load-bearing specs here are the two that guard SHAPE and HONESTY.
 *
 * Shape: the first cut of this module typed `graph.edges` as `{from, to}`
 * objects because that reads naturally. Loom writes `[from, to]` TUPLES, so
 * "Depended on by" silently rendered nothing — no error, no empty-state, just
 * a missing section in an answer that otherwise looked complete. An agent
 * would have concluded a package had no dependents. Reading the artifact
 * rather than guessing is the whole premise of the module, so the fixtures
 * below use loom's real on-disk shape.
 *
 * Honesty: loom reads DECLARED truth, so `unused-dep` is lexical evidence and
 * the report cannot say what is INSTALLED. That caveat has to travel with the
 * data — an agent that reads "unused" as "safe to delete" will delete a
 * package a bin loads at runtime.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  MISSING_REPORT_MESSAGE,
  findReportPath,
  loadReport,
  renderFabricOverview,
  renderPackageFabric,
  type LoomReportShape,
} from '../loom'

const roots: string[] = []
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })))

/** A report in loom's REAL on-disk shape — tuple edges included. */
const REPORT: LoomReportShape = {
  model: {
    packages: [
      {
        name: '@x/core',
        version: '1.0.0',
        deps: [{ name: 'left-pad', field: 'dependencies' }],
      },
      {
        name: '@x/app',
        version: '1.0.0',
        private: true,
        deps: [
          { name: '@x/core', field: 'dependencies' },
          { name: '@x/testkit', field: 'devDependencies' },
        ],
      },
    ],
  },
  graph: {
    depths: { '@x/core': 0, '@x/app': 1 },
    reach: { '@x/core': 1, '@x/app': 0 },
    cycles: [['@x/a', '@x/b', '@x/a']],
    edges: [['@x/app', '@x/core']],
  },
  issues: [
    { code: 'phantom-dep', severity: 'warning', pkg: '@x/app', dep: 'ghost', message: 'imports `ghost` but never declares it' },
    { code: 'unused-dep', severity: 'info', pkg: '@x/core', dep: 'left-pad', message: 'declares `left-pad` but no source imports it' },
  ],
  stats: { edges: 1, depth: 1, external: 1 },
}

function reportAt(report: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'mcp-loom-'))
  roots.push(root)
  writeFileSync(join(root, 'loom-report.json'), JSON.stringify(report))
  return root
}

describe('loading the report', () => {
  it('finds it by walking UP, like a package manager looking for a root', () => {
    const root = reportAt(REPORT)
    const nested = join(root, 'packages/deep/src')
    mkdirSync(nested, { recursive: true })
    expect(findReportPath(nested)).toBe(join(root, 'loom-report.json'))
  })

  it('a missing report is instructions, never an invented graph', () => {
    const empty = mkdtempSync(join(tmpdir(), 'mcp-loom-empty-'))
    roots.push(empty)
    const r = loadReport(empty)
    expect(r.ok).toBe(false)
    expect(MISSING_REPORT_MESSAGE).toMatch(/loom scan/)
  })

  it('a present-but-corrupt report is named as unreadable, not treated as empty', () => {
    // Distinguished deliberately: "no report" and "broken report" need
    // different actions from the reader, and collapsing them hides a bug.
    const root = mkdtempSync(join(tmpdir(), 'mcp-loom-bad-'))
    roots.push(root)
    writeFileSync(join(root, 'loom-report.json'), '{ not json')
    const r = loadReport(root)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('unreadable')
  })

  it('a report without model.packages is unreadable rather than a zero-package fabric', () => {
    const r = loadReport(reportAt({ graph: {} }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.detail).toMatch(/model\.packages/)
  })
})

describe('the overview', () => {
  const out = renderFabricOverview(REPORT, 0)

  it('states the shape and the finding counts', () => {
    expect(out).toContain('2 workspace package(s)')
    expect(out).toContain('0 error · 1 warning · 1 info')
  })

  it('names runtime cycles', () => {
    expect(out).toContain('@x/a → @x/b → @x/a')
  })

  it('lists gating findings and NOT the info ones', () => {
    // info is real signal but not a gate; mixing them buries the actionable set.
    expect(out).toContain('`phantom-dep`')
    expect(out).not.toContain('- **info**')
  })

  it('ranks blast radius, which is the question a graph exists to answer', () => {
    expect(out).toContain('@x/core → 1 dependent(s)')
  })

  it('carries the declared-truth caveat with the data', () => {
    expect(out).toMatch(/DECLARED truth/)
    expect(out).toMatch(/lexical evidence, not proof/)
  })

  it('flags a stale report, and stays quiet about a fresh one', () => {
    expect(renderFabricOverview(REPORT, 30)).toMatch(/30 day\(s\) old/)
    expect(out).not.toMatch(/day\(s\) old/)
  })
})

describe('one package', () => {
  const out = renderPackageFabric(REPORT, '@x/core', 0)

  it('reports depth and blast radius', () => {
    expect(out).toContain('depth: 0')
    expect(out).toContain('blast radius: 1 dependent(s)')
  })

  it('resolves DEPENDENTS from loom\'s tuple edges', () => {
    // The regression this file exists for. With `edges` mistyped as objects the
    // filter matched nothing and this section vanished silently — the answer
    // still looked complete, which is the dangerous kind of wrong.
    expect(out).toContain('## Depended on by (1)')
    expect(out).toContain('`@x/app`')
  })

  it('separates runtime deps from dev ones', () => {
    // A devDependency is not part of what a consumer receives, so listing it
    // among "declares" would misinform exactly the decision this answers.
    const app = renderPackageFabric(REPORT, '@x/app', 0)
    expect(app).toContain('`@x/core`')
    expect(app).not.toContain('@x/testkit')
  })

  it('shows that package\'s own findings, including info-level ones', () => {
    // Scoped to one package there is room for the full picture, and an
    // `unused-dep` is exactly what someone asks about before deleting a dep.
    expect(out).toContain('`unused-dep`')
  })

  it('marks a private package as private', () => {
    expect(renderPackageFabric(REPORT, '@x/app', 0)).toContain('(private)')
  })

  it('an unknown name suggests near matches instead of returning nothing', () => {
    const miss = renderPackageFabric(REPORT, 'core', 0)
    expect(miss).toMatch(/No workspace package named/)
    expect(miss).toContain('@x/core')
  })
})
