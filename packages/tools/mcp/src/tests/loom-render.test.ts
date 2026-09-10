/**
 * The dependency-fabric report an AI assistant reads.
 *
 * This output is not shown to a person who can spot that something looks
 * off — it is consumed by an assistant that will act on it. So the
 * failure mode is not an ugly report, it is an assistant confidently
 * telling someone that `@pyreon/core` has zero dependents, or that a
 * package it cannot find simply does not exist.
 *
 * Everything here is optional-field rendering, which is exactly the
 * shape that produces `undefined` in prose. `loom-report.json` is
 * written by a separate tool and versions independently: an older loom
 * emits no `stats`, a scan of a flat repo emits no `cycles`, a private
 * package has no `version`. Each of those must degrade to a number or a
 * dash, never to the word "undefined" in a sentence an assistant then
 * repeats.
 *
 * The truncation rules are the other half. A 400-finding monorepo must
 * not paste 400 lines into a context window, and the elision has to SAY
 * that it elided — a silently truncated list reads as a complete one, so
 * the assistant concludes there are exactly 25 problems.
 */
import { describe, expect, it } from 'vitest'
import { renderFabricOverview, renderPackageFabric } from '../loom'
import type { LoomReportShape } from '../loom'

const pkg = (name: string, extra: Record<string, unknown> = {}) => ({ name, ...extra })

const full: LoomReportShape = {
  model: { packages: [pkg('@x/a', { version: '1.0.0' }), pkg('@x/b', { version: '2.0.0' })] },
  graph: {
    depths: { '@x/a': 0, '@x/b': 1 },
    edges: [['@x/b', '@x/a']],
    cycles: [],
    reach: { '@x/a': 1, '@x/b': 0 },
  },
  issues: [],
  stats: { edges: 1, depth: 1, external: 12 },
}

describe('the overview never renders "undefined" into prose', () => {
  it('reports the real numbers when the report is complete', () => {
    // The control: without it, "an empty report degrades" passes against
    // a renderer that always prints zeros.
    const out = renderFabricOverview(full, 0)
    expect(out).toContain('2 workspace package(s)')
    expect(out).toContain('internal edges: 1')
    expect(out).toContain('external deps: 12')
  })

  for (const [label, report] of [
    ['completely empty', {}],
    ['no model', { graph: {}, issues: [], stats: {} }],
    ['no graph', { model: { packages: [] } }],
    ['no stats', { model: { packages: [pkg('@x/a')] }, graph: { edges: [['@x/a', '@x/b']] } }],
    ['packages key absent', { model: {} }],
  ] as Array<[string, LoomReportShape]>) {
    it(`degrades cleanly when the report has ${label}`, () => {
      // An older loom, or a scan of a repo shape it did not expect. The
      // assistant must get zeros, not the word "undefined".
      const out = renderFabricOverview(report, 0)
      expect(out, label).not.toContain('undefined')
      expect(out, label).not.toContain('NaN')
      expect(out, label).toContain('workspace package(s)')
    })
  }

  it('falls back to counting edges when stats.edges is absent', () => {
    // The `??` chain exists because the edge count moved into `stats` in
    // a later loom. Reporting 0 edges for a repo that has them tells the
    // assistant the packages are unrelated.
    const out = renderFabricOverview(
      { model: { packages: [pkg('@x/a')] }, graph: { edges: [['a', 'b'], ['b', 'c']] } },
      0,
    )
    expect(out).toContain('internal edges: 2')
  })
})

describe('findings are summarised by severity and truncated audibly', () => {
  const issue = (severity: 'error' | 'warning' | 'info', n: number) => ({
    code: `c${n}`, severity, pkg: `@x/p${n}`, message: 'm',
  })

  it('counts each severity separately', () => {
    const out = renderFabricOverview(
      { ...full, issues: [issue('error', 1), issue('warning', 2), issue('warning', 3), issue('info', 4)] },
      0,
    )
    expect(out).toContain('1 error · 2 warning · 1 info')
  })

  it('lists errors and warnings but not info in the gating section', () => {
    // `info` is advisory by definition — putting it under "gating" tells
    // the assistant to fix something that blocks nothing.
    const out = renderFabricOverview({ ...full, issues: [issue('error', 1), issue('info', 2)] }, 0)
    expect(out).toContain('Gating findings (1)')
    expect(out).toContain('`c1`')
    expect(out).not.toContain('`c2`')
  })

  it('SAYS how many it elided past 25', () => {
    // A silently truncated list reads as complete, so the assistant
    // concludes the repo has exactly 25 problems.
    const many = Array.from({ length: 40 }, (_, i) => issue('warning', i))
    const out = renderFabricOverview({ ...full, issues: many }, 0)
    expect(out).toContain('Gating findings (40)')
    expect(out).toContain('…and 15 more')
  })

  it('does not claim an elision when everything fits', () => {
    const out = renderFabricOverview({ ...full, issues: [issue('error', 1)] }, 0)
    expect(out).not.toContain('more')
  })

  it('renders the dependency arrow only for a finding that HAS one', () => {
    // `pkg → dep` with an undefined dep produces `@x/p → undefined`.
    const out = renderFabricOverview(
      { ...full, issues: [
        { code: 'a', severity: 'error', pkg: '@x/p', dep: 'lodash', message: 'm' },
        { code: 'b', severity: 'error', pkg: '@x/q', message: 'm' },
      ] },
      0,
    )
    expect(out).toContain('@x/p → lodash')
    expect(out).toContain('`b` — @x/q')
    expect(out).not.toContain('undefined')
  })
})

describe('cycles and blast radius', () => {
  it('renders each runtime cycle as a path', () => {
    // A cycle reported as a bare list of names gives no direction, which
    // is the only actionable part.
    const out = renderFabricOverview({ ...full, graph: { ...full.graph, cycles: [['a', 'b', 'a']] } }, 0)
    expect(out).toContain('Runtime cycles (1)')
    expect(out).toContain('a → b → a')
  })

  it('omits the cycle section entirely when there are none', () => {
    // An empty "Runtime cycles (0)" heading invites the assistant to
    // look for something that is not there.
    expect(renderFabricOverview(full, 0)).not.toContain('Runtime cycles')
  })

  it('ranks blast radius descending and drops the zeroes', () => {
    // A package nothing depends on is not a blast-radius entry; listing
    // it at the bottom buries the ones that matter.
    const out = renderFabricOverview(
      { ...full, graph: { ...full.graph, reach: { low: 1, high: 9, none: 0, mid: 4 } } },
      0,
    )
    const body = out.slice(out.indexOf('Blast radius'))
    expect(body.indexOf('high')).toBeLessThan(body.indexOf('mid'))
    expect(body.indexOf('mid')).toBeLessThan(body.indexOf('low'))
    expect(body).not.toContain('none')
  })

  it('omits blast radius when nothing has dependents', () => {
    const out = renderFabricOverview({ ...full, graph: { reach: { a: 0 } } }, 0)
    expect(out).not.toContain('Blast radius')
  })
})

describe('staleness is disclosed, because a stale report reads as current', () => {
  it('warns for an old report and names the age', () => {
    const out = renderFabricOverview(full, 30)
    expect(out).toContain('30 day(s) old')
    expect(out).toContain('loom scan')
  })

  it('says nothing for a fresh one', () => {
    expect(renderFabricOverview(full, 1)).not.toContain('day(s) old')
    expect(renderFabricOverview(full, 0)).not.toContain('day(s) old')
  })

  it('carries the same warning into the per-package view', () => {
    expect(renderPackageFabric(full, '@x/a', 30)).toContain('30 day(s) old')
    expect(renderPackageFabric(full, '@x/a', 0)).not.toContain('day(s) old')
  })
})

describe('an unknown package name is a lookup failure, not an absence', () => {
  it('suggests near matches rather than saying it does not exist', () => {
    // Without the suggestion, an assistant asked about `core` concludes
    // the package is gone and starts writing a replacement.
    const out = renderPackageFabric(full, 'a', 0)
    expect(out).toContain('No workspace package named')
    expect(out).toContain('Did you mean')
    expect(out).toContain('@x/a')
  })

  it('points at the full list when nothing is close', () => {
    const out = renderPackageFabric(full, 'zzz-unrelated', 0)
    expect(out).not.toContain('Did you mean')
    expect(out).toContain('no `package` argument')
  })
})

describe('the per-package view degrades field by field', () => {
  it('renders every section when the data is present', () => {
    const out = renderPackageFabric(
      {
        model: { packages: [
          pkg('@x/a', { version: '1.0.0', deps: [
            { name: 'zod', field: 'dependencies' },
            { name: 'vitest', field: 'devDependencies' },
          ] }),
        ] },
        graph: { edges: [['@x/b', '@x/a']], depths: { '@x/a': 2 }, reach: { '@x/a': 7 } },
        issues: [{ code: 'phantom-dep', severity: 'warning', pkg: '@x/a', message: 'msg' }],
      },
      '@x/a',
      0,
    )
    expect(out).toContain('- version: 1.0.0')
    expect(out).toContain('- depth: 2')
    expect(out).toContain('blast radius: 7 dependent(s)')
    expect(out).toContain('Declares (1 runtime)')
    expect(out, 'a devDependency is not a runtime edge').not.toContain('vitest')
    expect(out).toContain('Depended on by (1)')
    expect(out).toContain('phantom-dep')
  })

  it('shows a dash for a missing version and zeroes for missing graph data', () => {
    // A private package legitimately has no version. `version: undefined`
    // in the output is the assistant's cue to go looking for a bug.
    const out = renderPackageFabric({ model: { packages: [pkg('@x/a', { private: true })] } }, '@x/a', 0)
    expect(out).toContain('(private)')
    expect(out).toContain('- version: —')
    expect(out).toContain('- depth: 0')
    expect(out).toContain('blast radius: 0')
    expect(out).not.toContain('undefined')
  })

  it('omits empty sections rather than heading them with (0)', () => {
    const out = renderPackageFabric({ model: { packages: [pkg('@x/a')] } }, '@x/a', 0)
    expect(out).not.toContain('Declares')
    expect(out).not.toContain('Depended on by')
    expect(out).not.toContain('Findings')
  })

  it('reports only the findings belonging to THIS package', () => {
    // Attributing another package's finding sends the assistant to edit
    // the wrong file.
    const out = renderPackageFabric(
      { ...full, issues: [
        { code: 'mine', severity: 'error', pkg: '@x/a', message: 'm' },
        { code: 'theirs', severity: 'error', pkg: '@x/b', message: 'm' },
      ] },
      '@x/a',
      0,
    )
    expect(out).toContain('mine')
    expect(out).not.toContain('theirs')
  })

  it('always states that the report reads DECLARED truth', () => {
    // loom reads package.json, never the lockfile or the registry. An
    // assistant that misses that will trust it about installed versions.
    for (const out of [renderFabricOverview(full, 0), renderPackageFabric(full, '@x/a', 0)]) {
      expect(out.toLowerCase()).toContain('declared')
    }
  })
})
