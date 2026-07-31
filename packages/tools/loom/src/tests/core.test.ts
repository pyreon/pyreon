/**
 * The core engine over the synthetic fixture — one assertion block per issue
 * class the fixture encodes, plus the graph analysis and the report fold.
 */
import { rmSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  analyzeGraph,
  buildReport,
  externalUsage,
  isDevSurfacePath,
  majorOf,
  scanWorkspace,
  specifierToPackage,
  type LoomReport,
} from '../core'
import { stripNonCode } from '../core/imports'
import { makeFixtureWorkspace } from './fixture'

let root: string
let report: LoomReport

beforeAll(() => {
  root = makeFixtureWorkspace()
  report = buildReport(root)
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('workspace scan', () => {
  it('resolves every member from the workspace globs', () => {
    expect(report.model.packages.map((p) => p.name).sort()).toEqual([
      '@fix/app',
      '@fix/auth',
      '@fix/data',
      '@fix/plugin',
      '@fix/util',
    ])
  })

  it('reads root overrides', () => {
    expect(report.model.root.overrides['pinned-pkg']).toBe('3.0.0')
  })

  it('throws loudly on a non-workspace dir (empty scan is not a clean pass)', () => {
    expect(() => scanWorkspace('/nonexistent-loom-root')).toThrow(/no package\.json/)
  })
})

describe('graph analysis', () => {
  it('finds the runtime cycle auth ⇄ data, deduplicated', () => {
    expect(report.graph.cycles).toHaveLength(1)
    expect([...report.graph.cycles[0]!].sort()).toEqual(['@fix/auth', '@fix/data'])
  })

  it('computes reach as transitive dependents (peer edges included)', () => {
    // util ← app (dependencies) AND ← plugin (peerDependencies — peers are
    // runtime edges: the peer consumes util's API at runtime).
    expect(report.graph.reach['@fix/util']).toBe(2)
    // app is an entry point — nobody depends on it.
    expect(report.graph.reach['@fix/app']).toBe(0)
  })

  it('entry points sit at depth 0, their deps below', () => {
    expect(report.graph.depths['@fix/app']).toBe(0)
    expect(report.graph.depths['@fix/util']).toBeGreaterThan(0)
  })

  it('externalUsage groups ranges with their declaring users', () => {
    const ext = externalUsage(report.model)
    const leftPad = ext.find((e) => e.name === 'left-pad')!
    expect(Object.keys(leftPad.ranges).sort()).toEqual(['^1.0.0', '^2.0.0'])
  })

  it('dev edges never create cycles (semantic split)', () => {
    const model = scanWorkspace(root)
    // Re-declare the cycle edges as devDependencies: no runtime cycle remains.
    for (const p of model.packages) {
      for (const d of p.deps) {
        if (d.name.startsWith('@fix/')) (d as { field: string }).field = 'devDependencies'
      }
    }
    expect(analyzeGraph(model).cycles).toHaveLength(0)
  })
})

describe('detectors (via the report)', () => {
  const byCode = (code: string) => report.issues.filter((i) => i.code === code)

  it('version-drift: cross-major is error, same-major is warning, overridden is info', () => {
    const drift = byCode('version-drift')
    expect(drift.find((i) => i.dep === 'left-pad')?.severity).toBe('error')
    expect(drift.find((i) => i.dep === 'chalk')?.severity).toBe('warning')
    expect(drift.find((i) => i.dep === 'pinned-pkg')?.severity).toBe('info')
  })

  it('internal-range: a bare semver on a workspace member is an error', () => {
    const hit = byCode('internal-range').find((i) => i.pkg === '@fix/app' && i.dep === '@fix/util')
    expect(hit?.severity).toBe('error')
    expect(hit?.message).toContain('workspace:')
  })

  it('cycle: reported with the loop path', () => {
    const hit = byCode('cycle')[0]!
    expect(((hit.details?.path ?? []) as string[]).sort()).toEqual(['@fix/auth', '@fix/data'])
  })

  it('phantom-dep: undeclared import in shipping source, with the file named', () => {
    const hit = byCode('phantom-dep').find((i) => i.dep === 'undeclared-pkg')
    expect(hit?.pkg).toBe('@fix/app')
    expect(hit?.details?.files).toContain('src/index.ts')
  })

  it('prod-import-of-dev-dep: dev-only declaration imported by shipping source', () => {
    const hit = byCode('prod-import-of-dev-dep').find((i) => i.dep === 'dev-only-pkg')
    expect(hit?.pkg).toBe('@fix/app')
  })

  it('unused-dep: declared, never imported, info severity (lexical honesty)', () => {
    const hit = byCode('unused-dep').find((i) => i.dep === 'never-imported')
    expect(hit?.severity).toBe('info')
    expect(hit?.message).toContain('lexical evidence')
  })

  it('peer-mismatch: internal peer range disagreeing with the workspace copy by a major', () => {
    const hit = byCode('peer-mismatch').find((i) => i.pkg === '@fix/plugin')
    expect(hit?.dep).toBe('@fix/util')
  })

  it('comments and template literals never produce findings', () => {
    const deps = report.issues.map((i) => i.dep)
    expect(deps).not.toContain('ghost-pkg')
    expect(deps).not.toContain('template-pkg')
  })

  it('stats fold matches the issue list', () => {
    expect(report.stats.errors).toBe(report.issues.filter((i) => i.severity === 'error').length)
    expect(report.stats.cycles).toBe(1)
  })
})

describe('lexical primitives', () => {
  it('specifierToPackage: package extraction + prose rejection', () => {
    expect(specifierToPackage('@scope/pkg/sub/path')).toBe('@scope/pkg')
    expect(specifierToPackage('lodash/fp')).toBe('lodash')
    expect(specifierToPackage('./relative')).toBeNull()
    expect(specifierToPackage('node:fs')).toBeNull()
    expect(specifierToPackage('fs')).toBeNull()
    expect(specifierToPackage('https://example.com')).toBeNull()
    expect(specifierToPackage('never asked')).toBeNull()
    expect(specifierToPackage('vite-plugin?raw')).toBe('vite-plugin')
  })

  it('isDevSurfacePath: tests/config/scripts/templates are dev surface', () => {
    expect(isDevSurfacePath('src/tests/x.test.ts')).toBe(true)
    expect(isDevSurfacePath('vitest.config.ts')).toBe(true)
    expect(isDevSurfacePath('templates/app/src/index.tsx')).toBe(true)
    expect(isDevSurfacePath('src/index.ts')).toBe(false)
  })

  it('stripNonCode: drops comments + template contents, keeps quoted specifiers', () => {
    const out = stripNonCode(
      `// import a from 'gone'\nconst t = \`import b from 'also-gone'\`\nimport c from 'kept'`,
    )
    expect(out).not.toContain('gone')
    expect(out).toContain("'kept'")
  })

  it('majorOf: common range shapes', () => {
    expect(majorOf('^1.2.3')).toBe(1)
    expect(majorOf('~0.9.0')).toBe(0)
    expect(majorOf('>=5.0.0 <7.0.0')).toBe(5)
    expect(majorOf('workspace:*')).toBeNull()
    expect(majorOf('*')).toBeNull()
  })
})

describe('dogfood — the Pyreon monorepo itself', () => {
  it('scans the real workspace with real structure', () => {
    // Four levels up from this file's package: the repo root.
    const repo = buildReport(new URL('../../../../..', import.meta.url).pathname, { noImports: true })
    // Loose bounds, not exact counts — the repo grows; the point is the scan
    // resolves the two-level globs and builds a real graph.
    expect(repo.model.packages.length).toBeGreaterThan(100)
    expect(repo.graph.edges.length).toBeGreaterThan(400)
    expect(repo.stats.depth).toBeGreaterThanOrEqual(5)
    // CLAUDE.md's own claim, machine-checked: the runtime graph is ACYCLIC.
    expect(repo.graph.cycles).toHaveLength(0)
  })
})
