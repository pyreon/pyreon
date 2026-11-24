/**
 * The core engine over the synthetic fixture — one assertion block per issue
 * class the fixture encodes, plus the graph analysis and the report fold.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
import { renderScanText } from '../cli/render'
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

  it('a cycle does not inflate depth: its members share one level (#4391)', () => {
    // app → forms → validation → i18n → forms (the cycle), i18n → ui → core.
    // The longest acyclic chain from app is app, {forms, validation, i18n},
    // ui, core: core sits at depth 3. Relaxing THROUGH the cycle walked it
    // until the V-1 cap and pushed core to 13 on the issue's 14-package repo.
    const pkg = (name: string, deps: string[]) => ({
      name,
      version: '1.0.0',
      dir: name,
      private: false,
      deps: deps.map((d) => ({ name: d, range: 'workspace:*', field: 'dependencies' as const })),
    })
    const model = scanWorkspace(root)
    model.packages = [
      pkg('app', ['forms']),
      pkg('forms', ['validation']),
      pkg('validation', ['i18n']),
      pkg('i18n', ['forms', 'ui']),
      pkg('ui', ['core']),
      pkg('core', []),
      ...Array.from({ length: 8 }, (_, i) => pkg(`leaf${i}`, ['core'])),
    ]
    const { depths, cycles } = analyzeGraph(model)
    expect(cycles).toHaveLength(1)
    expect(depths.app).toBe(0)
    expect([depths.forms, depths.validation, depths.i18n]).toEqual([1, 1, 1])
    expect(depths.ui).toBe(2)
    // A leaf that depends on core directly is an entry; core is still below ui.
    expect(depths.core).toBe(3)
    expect(depths.leaf0).toBe(0)
  })

  it('a fully cyclic workspace sits at depth 0', () => {
    const model = scanWorkspace(root)
    const dep = (name: string) => ({ name, range: 'workspace:*', field: 'dependencies' as const })
    model.packages = [
      { name: 'a', version: '1.0.0', dir: 'a', private: false, deps: [dep('b')] },
      { name: 'b', version: '1.0.0', dir: 'b', private: false, deps: [dep('a')] },
    ]
    expect(analyzeGraph(model).depths).toEqual({ a: 0, b: 0 })
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

describe('@types satisfaction + ignores', () => {
  it('a declared @types twin satisfies a type-only import (the mdast pattern)', () => {
    const root = mkdtempSync(join(tmpdir(), 'loom-types-'))
    try {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'r', workspaces: ['p/*'] }))
      mkdirSync(join(root, 'p/a/src'), { recursive: true })
      writeFileSync(
        join(root, 'p/a/package.json'),
        JSON.stringify({
          name: 'a', version: '1.0.0',
          devDependencies: { '@types/mdast': '^4.0.0', '@types/scope__thing': '^1.0.0' },
        }),
      )
      writeFileSync(join(root, 'p/a/src/i.ts'), `import type { Root } from 'mdast'
import type { T } from '@scope/thing'`)
      const r = buildReport(root)
      expect(r.issues.filter((i) => i.code === 'phantom-dep')).toHaveLength(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('loom.ignore downgrades matches to info WITH the reason; missing reason throws', () => {
    const root = mkdtempSync(join(tmpdir(), 'loom-ignore-'))
    try {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          name: 'r', workspaces: ['p/*'],
          loom: { ignore: [{ pkg: 'a', dep: 'ghost', code: 'phantom-dep', reason: 'vendored at runtime' }] },
        }),
      )
      mkdirSync(join(root, 'p/a/src'), { recursive: true })
      writeFileSync(join(root, 'p/a/package.json'), JSON.stringify({ name: 'a', version: '1.0.0' }))
      writeFileSync(join(root, 'p/a/src/i.ts'), `import 'ghost'`)
      const r = buildReport(root)
      const hit = r.issues.find((i) => i.dep === 'ghost')!
      expect(hit.severity).toBe('info')
      expect(hit.message).toContain('vendored at runtime')
      // No silent drop: the finding is still THERE.
      expect(r.stats.errors).toBe(0)

      // Reason is mandatory.
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ name: 'r', workspaces: ['p/*'], loom: { ignore: [{ dep: 'ghost' }] } }),
      )
      expect(() => buildReport(root)).toThrow(/reason/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// #4307 — 6 of the monorepo's own `loom.ignore` entries had stopped matching
// anything, and nothing said so: an entry whose finding is gone keeps
// suppressing whatever fits it next, under a reason that is no longer true.
describe('stale loom.ignore entries', () => {
  function workspace(ignore: object[]): string {
    const root = mkdtempSync(join(tmpdir(), 'loom-stale-'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'r', workspaces: ['p/*'], loom: { ignore } }))
    mkdirSync(join(root, 'p/a/src'), { recursive: true })
    writeFileSync(join(root, 'p/a/package.json'), JSON.stringify({ name: 'a', version: '1.0.0' }))
    writeFileSync(join(root, 'p/a/src/i.ts'), `import 'ghost'`)

    return root
  }

  it('reports an entry that suppressed nothing as a stale-ignore warning; a used one is not reported', () => {
    const root = workspace([
      { pkg: 'a', dep: 'ghost', code: 'phantom-dep', reason: 'vendored at runtime' },
      { pkg: 'a', dep: 'gone', code: 'phantom-dep', reason: 'was vendored once' },
    ])
    try {
      const stale = buildReport(root).issues.filter((i) => i.code === 'stale-ignore')
      expect(stale).toHaveLength(1)
      expect(stale[0]).toMatchObject({ severity: 'warning', pkg: 'a', dep: 'gone' })
      expect(stale[0]!.message).toContain('matched no finding')
      expect(stale[0]!.message).toContain('was vendored once')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not judge an entry for a lexical finding under --no-imports (that detector did not run)', () => {
    const root = workspace([
      { pkg: 'a', dep: 'gone', code: 'phantom-dep', reason: 'lexical' },
      { dep: 'gone', reason: 'any code' },
      { pkg: 'a', code: 'cycle', reason: 'a cycle that was fixed' },
    ])
    try {
      const stale = buildReport(root, { noImports: true }).issues.filter((i) => i.code === 'stale-ignore')
      expect(stale.map((i) => i.message.includes('a cycle that was fixed'))).toEqual([true])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('takes a loom.severity override like any other code', () => {
    const root = workspace([{ pkg: 'a', dep: 'gone', code: 'phantom-dep', reason: 'x' }])
    try {
      const r = buildReport(root, { settings: { severity: { 'stale-ignore': 'error' } } })
      expect(r.issues.find((i) => i.code === 'stale-ignore')?.severity).toBe('error')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // #4756 review: the entry for a LIVE finding that is already info (an
  // unused-dep, a private package's finding, a code lowered while it is burned
  // down) was reported as stale, because the info-skip ran before "used" was
  // recorded; a narrower entry after a broader one looked stale too.
  function workspaceWithUnused(ignore: object[]): string {
    const root = mkdtempSync(join(tmpdir(), 'loom-stale-info-'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'r', workspaces: ['p/*'], loom: { ignore } }))
    mkdirSync(join(root, 'p/a/src'), { recursive: true })
    writeFileSync(
      join(root, 'p/a/package.json'),
      JSON.stringify({ name: 'a', version: '1.0.0', dependencies: { 'never-imported': '^1.0.0' } }),
    )
    writeFileSync(join(root, 'p/a/src/i.ts'), `import 'ghost'`)

    return root
  }

  it('an entry for a live INFO finding (unused-dep) is not stale', () => {
    const root = workspaceWithUnused([{ pkg: 'a', dep: 'never-imported', code: 'unused-dep', reason: 'loaded by a plugin' }])
    try {
      const r = buildReport(root)
      expect(r.issues.find((i) => i.code === 'unused-dep')?.severity).toBe('info')
      expect(r.issues.filter((i) => i.code === 'stale-ignore')).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('lowering a code to info while burning it down keeps its entries live', () => {
    const root = workspace([{ pkg: 'a', dep: 'ghost', code: 'phantom-dep', reason: 'vendored' }])
    try {
      const r = buildReport(root, { settings: { severity: { 'phantom-dep': 'info' } } })
      expect(r.issues.filter((i) => i.code === 'stale-ignore')).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('a narrower entry after a broader one is reported as SHADOWED, naming the broader one', () => {
    const root = workspace([
      { pkg: 'a', reason: 'everything in a' },
      { pkg: 'a', dep: 'ghost', code: 'phantom-dep', reason: 'vendored' },
    ])
    try {
      const stale = buildReport(root).issues.filter((i) => i.code === 'stale-ignore')
      expect(stale).toHaveLength(1)
      expect(stale[0]!.message).toContain('is shadowed')
      expect(stale[0]!.message).toContain('any code in `a`')
      expect(stale[0]!.message).not.toContain('matched no finding')
      expect(stale[0]!.details).toMatchObject({ shadowedBy: { pkg: 'a' } })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('points at the file the entry is declared in, not the package it names', () => {
    const root = workspace([{ pkg: 'a', dep: 'gone', code: 'phantom-dep', reason: 'x' }])
    try {
      const r = buildReport(root)
      expect(r.issues.find((i) => i.code === 'stale-ignore')?.details?.declaredIn).toBe('package.json')
      const text = renderScanText(r, { dir: '.', strict: false, reportPath: undefined, elapsedMs: 1, color: 0, unicode: true })
      const block = text.slice(text.indexOf('stale-ignore'))
      expect(block.split('\n').find((l) => l.includes('↳'))?.trim()).toBe('↳ package.json')
      const fromConfig = buildReport(root, {
        settings: { ignores: [{ pkg: 'a', dep: 'gone', reason: 'x' }], ignoresFrom: 'pyreon.config.ts' },
      })
      expect(fromConfig.issues.find((i) => i.code === 'stale-ignore')?.details?.declaredIn).toBe('pyreon.config.ts')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('the monorepo has none', () => {
    const repo = buildReport(new URL('../../../../..', import.meta.url).pathname)
    expect(repo.issues.filter((i) => i.code === 'stale-ignore').map((i) => i.message)).toEqual([])
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
    // AGENTS.md's own claim, machine-checked: the runtime graph is ACYCLIC.
    expect(repo.graph.cycles).toHaveLength(0)
  })
})
