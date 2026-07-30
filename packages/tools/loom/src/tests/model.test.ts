/**
 * The UI's pure state layer — node building, layout geometry, ranking,
 * path reconstruction — over the fixture report. No DOM: the views render
 * this data verbatim, so these contracts are what the observatory shows.
 */
import { rmSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildReport } from '../core'
import type { LoomReport } from '../core'
import { buildNodes, createModel, impactRows, layoutGraph, pathTo, shortName } from '../ui/model'
import { makeFixtureWorkspace } from './fixture'

let root: string
let report: LoomReport

beforeAll(() => {
  root = makeFixtureWorkspace()
  report = buildReport(root)
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('buildNodes', () => {
  it('internal members + external deps become one node universe', () => {
    const nodes = buildNodes(report)
    const internal = nodes.filter((n) => n.kind === 'internal')
    const external = nodes.filter((n) => n.kind === 'external')
    expect(internal.map((n) => n.id)).toContain('@fix/app')
    expect(external.map((n) => n.id)).toContain('left-pad')
  })

  it('cycle members get circular status; drifting externals get drift', () => {
    const nodes = buildNodes(report)
    expect(nodes.find((n) => n.id === '@fix/auth')?.status).toBe('circular')
    expect(nodes.find((n) => n.id === 'left-pad')?.status).toBe('drift')
  })

  it('an external with one range shows the range; multiple show the count', () => {
    const nodes = buildNodes(report)
    expect(nodes.find((n) => n.id === 'dev-only-pkg')?.version).toBe('^1.0.0')
    expect(nodes.find((n) => n.id === 'left-pad')?.version).toBe('2 ranges')
  })

  it('externals sit one column past their deepest internal user', () => {
    const nodes = buildNodes(report)
    const util = nodes.find((n) => n.id === '@fix/util')!
    const leftPad = nodes.find((n) => n.id === 'left-pad')!
    expect(leftPad.depth).toBeGreaterThan(0)
    expect(leftPad.depth).toBe(Math.max(util.depth, 0) + 1)
  })
})

describe('createModel', () => {
  it('filters by kind and query together', () => {
    const m = createModel(report)
    m.kind.set('external')
    m.query.set('left')
    expect(m.shown().map((n) => n.id)).toEqual(['left-pad'])
    m.kind.set('internal')
    expect(m.shown()).toHaveLength(0)
  })

  it('selection falls back to the first node for unknown ids', () => {
    const m = createModel(report)
    m.select('nope')
    expect(m.sel().id).toBe(m.nodes[0]!.id)
  })
})

describe('layoutGraph', () => {
  it('columns by depth, every shown node positioned', () => {
    const nodes = buildNodes(report)
    const layout = layoutGraph(nodes)
    expect(layout.pos.size).toBe(nodes.length)
    // Same-depth nodes share an x; deeper nodes sit further right.
    const d0 = nodes.filter((n) => n.depth === 0)
    const xs = new Set(d0.map((n) => layout.pos.get(n.id)!.x))
    expect(xs.size).toBe(1)
  })
})

describe('impactRows', () => {
  it('ranks internal packages by transitive reach, descending', () => {
    const rows = impactRows(createModel(report))
    expect(rows.every((r) => r.node.kind === 'internal')).toBe(true)
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1]!.reach).toBeGreaterThanOrEqual(rows[i]!.reach)
    }
  })
})

describe('pathTo', () => {
  it('reconstructs a root → node chain over runtime edges', () => {
    const m = createModel(report)
    const path = pathTo(m, '@fix/util')
    expect(path[0]).toBe('@fix/app')
    expect(path[path.length - 1]).toBe('@fix/util')
  })

  it('externals get a real chain through their consumer', () => {
    const m = createModel(report)
    expect(pathTo(m, 'left-pad')).toEqual(['@fix/app', 'left-pad'])
  })

  it('an entry point is its own path', () => {
    const m = createModel(report)
    expect(pathTo(m, '@fix/plugin')).toEqual(['@fix/plugin'])
  })
})

describe('shortName', () => {
  it('strips only the scope prefix', () => {
    expect(shortName('@pyreon/loom')).toBe('loom')
    expect(shortName('lodash')).toBe('lodash')
  })
})
