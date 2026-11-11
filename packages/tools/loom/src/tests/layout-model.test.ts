/**
 * The pure logic behind the tool-app layout: the package list's order and
 * depth groups, the blast radius the graph lights, the version matrix, the
 * scan summary + gate, the suppress snippet, the report excerpt, the version
 * matrix's selection sheet, and the boot ground the dev server paints before
 * the bundle runs. All over the fixture report, which carries one instance of
 * every finding class.
 */
import { rmSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildReport } from '../core'
import type { LoomReport } from '../core'
import { BOOT_CSS } from '../dev/server'
import {
  blastRadius,
  buildNodes,
  createModel,
  depthGroups,
  issuesFor,
  layoutGraph,
  GRAPH_BOX_W,
  GRAPH_COL_W,
  scanSummary,
  sidebarOrder,
  suppressSnippet,
  versionMatrix,
} from '../ui/model'
import { NAV_QUERY, MOBILE_QUERY, prefsFrom } from '../ui/prefs'
import { reportExcerpt } from '../ui/report-excerpt'
import { versionSelectionCss } from '../ui/selection-css'
import { tokens } from '../ui/theme'
import { makeFixtureWorkspace } from './fixture'

let root: string
let report: LoomReport

beforeAll(() => {
  root = makeFixtureWorkspace()
  report = buildReport(root)
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('package list', () => {
  it('internal by depth then name, then externals by name', () => {
    const m = createModel(report)
    const ids = m.shown().map((n) => n.id)
    const firstExt = ids.findIndex((id) => m.byId.get(id)!.kind === 'external')
    const internal = ids.slice(0, firstExt).map((id) => m.byId.get(id)!)
    const external = ids.slice(firstExt)
    expect(internal.every((n) => n.kind === 'internal')).toBe(true)
    for (let i = 1; i < internal.length; i += 1) {
      const [a, b] = [internal[i - 1]!, internal[i]!]
      expect(a.depth < b.depth || (a.depth === b.depth && a.id < b.id), `${a.id} before ${b.id}`).toBe(true)
    }
    expect(external).toEqual([...external].sort((a, b) => a.localeCompare(b)))
    expect(external.every((id) => m.byId.get(id)!.kind === 'external')).toBe(true)
  })

  it('groups follow the order: one per depth, externals last, no empty group', () => {
    const groups = depthGroups(sidebarOrder(buildNodes(report).filter((n) => n.kind === 'internal')))
    expect(groups.map((g) => g.label)).toEqual(
      [...new Set(Object.values(report.graph.depths))].sort((a, b) => a - b).map((d) => `depth ${d}`),
    )
    const all = depthGroups(createModel(report).shown())
    expect(all.at(-1)!.label).toBe('external')
    expect(all.every((g) => g.items.length > 0)).toBe(true)
  })

  it('a filtered list regroups — a depth with no match disappears', () => {
    const m = createModel(report)
    m.query.set('util')
    expect(depthGroups(m.shown()).map((g) => g.items.map((n) => n.id))).toEqual([['@fix/util']])
  })
})

describe('blastRadius', () => {
  it('equals the report reach for every internal package (same edges, same walk)', () => {
    const m = createModel(report)
    for (const n of m.internal) {
      expect(blastRadius(m.byId, n.id).length, n.id).toBe(report.graph.reach[n.id])
      expect(m.reachOf(n.id)).toBe(report.graph.reach[n.id])
    }
  })

  it('never contains the package itself, even inside a cycle', () => {
    const m = createModel(report)
    expect(blastRadius(m.byId, '@fix/auth')).not.toContain('@fix/auth')
    expect(blastRadius(m.byId, '@fix/auth')).toContain('@fix/data')
  })

  it('an external reaches its users and everything above them', () => {
    const m = createModel(report)
    // left-pad is declared by app and util; app sits above util.
    expect(blastRadius(m.byId, 'left-pad')).toEqual(expect.arrayContaining(['@fix/app', '@fix/util']))
    expect(m.reachOf('left-pad')).toBe(blastRadius(m.byId, 'left-pad').length)
  })

  it('the model tracks the selection', () => {
    const m = createModel(report)
    m.select('@fix/util')
    expect(m.blast()).toEqual(blastRadius(m.byId, '@fix/util'))
  })
})

describe('graph layout', () => {
  it('top-aligned boxes, one column per depth, no overlap', () => {
    const m = createModel(report)
    const layout = layoutGraph(m.internal)
    const seen = new Set<string>()
    for (const n of m.internal) {
      const p = layout.pos.get(n.id)!
      const key = `${p.x},${p.y}`
      expect(seen.has(key), `${n.id} overlaps`).toBe(false)
      seen.add(key)
    }
    expect(GRAPH_COL_W).toBeGreaterThan(GRAPH_BOX_W)
    expect(layout.width).toBeGreaterThanOrEqual(GRAPH_BOX_W)
  })
})

describe('versionMatrix', () => {
  const depthOf = (id: string) => report.graph.depths[id] ?? 0

  it('drift only: just the externals with a version-drift finding, worst first', () => {
    const vm = versionMatrix(report, depthOf, true)
    const drifting = report.issues.filter((i) => i.code === 'version-drift').map((i) => i.dep)
    expect(vm.rows.map((r) => r.dep).sort()).toEqual([...drifting].sort())
    expect(vm.rows[0]!.drift).toBe('error')
  })

  it('a cross-major split tones every disagreeing cell red; a tie tones both', () => {
    const lp = versionMatrix(report, depthOf, true).rows.find((r) => r.dep === 'left-pad')!
    expect(lp.drift).toBe('error')
    expect(lp.cells.get('@fix/app')).toEqual(expect.objectContaining({ text: '^1.0.0', tone: 'error' }))
    expect(lp.cells.get('@fix/util')).toEqual(expect.objectContaining({ text: '^2.0.0', tone: 'error' }))
  })

  it('same-major drift is amber; a root-overridden one carries no tone', () => {
    const rows = versionMatrix(report, depthOf, true).rows
    const chalk = rows.find((r) => r.dep === 'chalk')!
    expect(chalk.drift).toBe('warning')
    expect([...chalk.cells.values()].every((c) => c.tone === 'warning')).toBe(true)
    const pinned = rows.find((r) => r.dep === 'pinned-pkg')!
    expect(pinned.drift).toBe('info')
    expect([...pinned.cells.values()].every((c) => c.tone === null)).toBe(true)
  })

  it('all externals: unused declarations marked, phantom imports become cells', () => {
    const vm = versionMatrix(report, depthOf, false)
    expect(vm.rows.length).toBeGreaterThanOrEqual(report.external.length)
    const never = vm.rows.find((r) => r.dep === 'never-imported')!
    expect(never.cells.get('@fix/util')!.note).toBe('unused')
    const phantom = vm.rows.find((r) => r.dep === 'undeclared-pkg')!
    expect(phantom.cells.get('@fix/app')).toEqual(
      expect.objectContaining({ text: 'phantom', note: 'phantom' }),
    )
  })

  it('a package declaring a dep in two fields shows both ranges in one cell', () => {
    const twice: LoomReport = {
      ...report,
      issues: [],
      external: [
        {
          name: 'react',
          ranges: {
            '>=18': [{ user: '@fix/util', field: 'peerDependencies' }],
            '^19.0.0': [{ user: '@fix/util', field: 'devDependencies' }],
          },
        },
      ],
    }
    const vm = versionMatrix(twice, depthOf, false)
    expect(vm.rows[0]!.cells.get('@fix/util')!.text).toBe('>=18 | ^19.0.0')
    expect(vm.rows[0]!.use).toBe('peer')
  })

  it('the use label is the strongest field; columns are depth-ordered', () => {
    const vm = versionMatrix(report, depthOf, false)
    expect(vm.rows.find((r) => r.dep === 'dev-only-pkg')!.use).toBe('dev')
    expect(vm.rows.find((r) => r.dep === 'left-pad')!.use).toBe('runtime')
    const depths = vm.cols.filter((c) => c !== 'ROOT').map(depthOf)
    expect(depths).toEqual([...depths].sort((a, b) => a - b))
  })

  it('a version matrix selection lights a column for a package, a row for an external', () => {
    const vm = versionMatrix(report, depthOf, false)
    const rows = vm.rows.map((r) => r.dep)
    const c = vm.cols.indexOf('@fix/app')
    expect(versionSelectionCss(vm.cols, rows, '@fix/app')).toContain(`grid-column:${c + 2}`)
    const r = rows.indexOf('left-pad')
    expect(versionSelectionCss(vm.cols, rows, 'left-pad')).toContain(`grid-row:${r + 2}`)
    expect(versionSelectionCss(vm.cols, rows, 'nope')).toBe('')
  })
})

// Every error-capable code lowered to warning: a report with warnings only.
const WARN_ALL = {
  'version-drift': 'warning',
  'internal-range': 'warning',
  cycle: 'warning',
  'phantom-dep': 'warning',
  'peer-mismatch': 'warning',
} as const

describe('scan summary and gate', () => {
  it('the gate exits 1 on errors, as `loom scan` does', () => {
    expect(report.stats.errors).toBeGreaterThan(0)
    expect(report.gate).toEqual({ strict: false, exit: 1 })
    expect(scanSummary(report).exit).toBe(1)
  })

  it('strict settings gate on warnings; without errors or strict it is 0', () => {
    const strict = buildReport(root, {
      settings: { strict: true, severity: WARN_ALL },
    })
    expect(strict.stats.errors).toBe(0)
    expect(strict.gate).toEqual({ strict: true, exit: 1 })
    // Same warnings, not strict: warnings advise, they do not gate.
    const advisory = buildReport(root, { settings: { severity: strict.issues.length ? WARN_ALL : {} } })
    expect(advisory.stats.warnings).toBeGreaterThan(0)
    expect(advisory.gate).toEqual({ strict: false, exit: 0 })
  })

  it('a report without `gate` (an older loom) falls back to errors alone', () => {
    const { gate: _gate, ...old } = report
    expect(scanSummary(old as LoomReport).exit).toBe(1)
  })

  it('ignored findings carry their reason as data, and the summary lists them', () => {
    const r = buildReport(root, {
      settings: { ignores: [{ dep: 'undeclared-pkg', reason: 'loaded by a plugin' }] },
    })
    const hit = r.issues.find((i) => i.dep === 'undeclared-pkg')!
    expect(hit.severity).toBe('info')
    expect(hit.ignored).toBe('loaded by a plugin')
    expect(scanSummary(r).ignored).toEqual([hit])
    expect(scanSummary(report).ignored).toEqual([])
  })
})

describe('suppressSnippet', () => {
  it('names exactly the finding, with the required reason', () => {
    const issue = issuesFor(report, '@fix/app').find((i) => i.code === 'phantom-dep')!
    const snip = suppressSnippet(issue)
    expect(snip).toContain(`pkg: '@fix/app', dep: 'undeclared-pkg', code: 'phantom-dep'`)
    expect(snip).toContain("reason: '…'")
  })

  it('omits dep for a finding without one, and escapes quotes', () => {
    expect(suppressSnippet({ pkg: "a'b", code: 'cycle' })).toContain(`pkg: 'a\\'b', code: 'cycle'`)
    expect(suppressSnippet({ pkg: 'x', code: 'cycle' })).not.toContain('dep:')
  })
})

describe('reportExcerpt', () => {
  it('states the real counts, the gate, and the first findings', () => {
    const text = reportExcerpt(report)
    expect(text).toContain(`"packages": ${report.stats.internal}`)
    expect(text).toContain(`"edges": ${report.stats.edges}`)
    expect(text).toContain(`"exit": 1`)
    expect(text).toContain(`"code": "${report.issues[0]!.code}"`)
    expect(text).toContain(`… ${report.issues.length - 3} more`)
  })

  it('an issue-free report says so instead of listing nothing', () => {
    expect(reportExcerpt({ ...report, issues: [] })).toContain('"issues": [] }')
  })
})

describe('breakpoints and the boot ground', () => {
  it('the list becomes a drawer at 860, the detail rail at 760', () => {
    const at = (w: number) =>
      prefsFrom({
        hash: '',
        storage: undefined,
        matches: (q) => {
          const max = /max-width: (\d+)px/.exec(q)
          return max ? w <= Number(max[1]) : false
        },
      })
    expect(at(1024)).toMatchObject({ navOpen: true, panelOpen: true })
    expect(at(800)).toMatchObject({ navOpen: false, panelOpen: true })
    expect(at(390)).toMatchObject({ navOpen: false, panelOpen: false })
    expect(NAV_QUERY).toContain('860')
    expect(MOBILE_QUERY).toContain('760')
  })

  it('paints the observatory ground for both themes before the bundle runs', () => {
    expect(BOOT_CSS).toContain(`background:${tokens(true).bg}`)
    expect(BOOT_CSS).toContain(`background:${tokens(false).bg}`)
    expect(BOOT_CSS).toContain('html[data-lm-theme=light]')
    expect(BOOT_CSS).toContain('prefers-color-scheme: light')
  })
})
