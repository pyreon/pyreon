/**
 * Fixture-based tests for `auditIslands` (PR C of the islands DX
 * roadmap). Each test builds a synthetic monorepo at a tmp path with
 * `packages/` + `examples/` subdirs containing minimal `island()` /
 * `hydrateIslands()` source — then runs the audit and asserts the
 * exact findings.
 *
 * Bisect-verification is done within the suite itself: for each of
 * the 5 finding types, one test asserts the finding fires given the
 * "broken" shape, AND a parallel test asserts NO finding fires given
 * the "fixed" shape. If a future contributor disables the detector
 * by mistake, the broken-shape test fails immediately.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { auditIslands, formatIslandAudit, type IslandFindingCode } from '../island-audit'

interface Fixture {
  root: string
  write: (relPath: string, body: string) => void
  cleanup: () => void
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-island-audit-fixture-'))
  mkdirSync(join(root, 'packages'), { recursive: true })
  return {
    root,
    write: (relPath, body) => {
      // Allow the caller to write under either `packages/` or `examples/`.
      // If the relPath doesn't start with one of those, default to packages/.
      const top = relPath.startsWith('packages/') || relPath.startsWith('examples/')
        ? relPath
        : `packages/${relPath}`
      const full = join(root, top)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, body)
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

function findingCodes(result: ReturnType<typeof auditIslands>): IslandFindingCode[] {
  return result.findings.map((f) => f.code)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Discovery
// ═══════════════════════════════════════════════════════════════════════════════

describe('auditIslands — discovery', () => {
  it('returns root=null when no packages/ dir exists', () => {
    const empty = mkdtempSync(join(tmpdir(), 'pyreon-island-audit-empty-'))
    try {
      const r = auditIslands(empty)
      expect(r.root).toBeNull()
      expect(r.findings).toEqual([])
      expect(r.summary.filesScanned).toBe(0)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('walks packages/ AND examples/ for source files', () => {
    const f = makeFixture()
    try {
      mkdirSync(join(f.root, 'examples'), { recursive: true })
      f.write('packages/a/src/A.tsx', `export const A = () => null`)
      f.write('examples/x/src/X.tsx', `export const X = () => null`)
      const r = auditIslands(f.root)
      // Two non-test source files
      expect(r.summary.filesScanned).toBe(2)
    } finally {
      f.cleanup()
    }
  })

  it('skips test files / __tests__ / node_modules / lib / dist', () => {
    const f = makeFixture()
    try {
      f.write('a/src/Real.tsx', `export const A = () => null`)
      f.write('a/src/Real.test.tsx', `it('x', () => {})`)
      f.write('a/src/__tests__/foo.tsx', `export const F = () => null`)
      f.write('a/lib/built.js', `export const Built = () => null`)
      f.write('a/dist/out.js', `export const Out = () => null`)
      const r = auditIslands(f.root)
      expect(r.summary.filesScanned).toBe(1)
    } finally {
      f.cleanup()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// duplicate-name
// ═══════════════════════════════════════════════════════════════════════════════

describe('auditIslands — duplicate-name', () => {
  it('flags two island() declarations with the same name (broken shape)', () => {
    const f = makeFixture()
    try {
      f.write(
        'a/src/A.tsx',
        `import { island } from '@pyreon/server'
         const Counter = island(() => import('./Counter'), { name: 'Counter', hydrate: 'load' })
         export { Counter }`,
      )
      f.write(
        'b/src/B.tsx',
        `import { island } from '@pyreon/server'
         const Counter = island(() => import('./CounterB'), { name: 'Counter', hydrate: 'load' })
         export { Counter }`,
      )
      // Loader-target stub files so nested-island doesn't kick in
      f.write('a/src/Counter.tsx', `export default () => null`)
      f.write('b/src/CounterB.tsx', `export default () => null`)
      const r = auditIslands(f.root)
      const codes = findingCodes(r)
      expect(codes).toContain('duplicate-name')
      // Two declarations → two findings (each with the other in `related`)
      expect(codes.filter((c) => c === 'duplicate-name')).toHaveLength(2)
      const dup = r.findings.find((finding) => finding.code === 'duplicate-name')!
      expect(dup.related).toBeDefined()
      expect(dup.related).toHaveLength(1)
      // Bisect-verify message content carries the conflicting name.
      expect(dup.message).toContain('"Counter"')
    } finally {
      f.cleanup()
    }
  })

  it('does NOT flag distinct names (fixed shape)', () => {
    const f = makeFixture()
    try {
      f.write(
        'a/src/A.tsx',
        `import { island } from '@pyreon/server'
         const A = island(() => import('./A1'), { name: 'A', hydrate: 'load' })
         export { A }`,
      )
      f.write(
        'b/src/B.tsx',
        `import { island } from '@pyreon/server'
         const B = island(() => import('./B1'), { name: 'B', hydrate: 'load' })
         export { B }`,
      )
      f.write('a/src/A1.tsx', `export default () => null`)
      f.write('b/src/B1.tsx', `export default () => null`)
      const r = auditIslands(f.root)
      expect(findingCodes(r)).not.toContain('duplicate-name')
    } finally {
      f.cleanup()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// never-with-registry-entry
// ═══════════════════════════════════════════════════════════════════════════════

describe('auditIslands — never-with-registry-entry', () => {
  it('flags a never-strategy island that is also in the registry (broken shape)', () => {
    const f = makeFixture()
    try {
      f.write(
        'a/src/Static.tsx',
        `import { island } from '@pyreon/server'
         const Static = island(() => import('./StaticInner'), { name: 'Static', hydrate: 'never' })
         export { Static }`,
      )
      f.write('a/src/StaticInner.tsx', `export default () => null`)
      f.write(
        'app/src/entry-client.ts',
        `import { hydrateIslands } from '@pyreon/server/client'
         hydrateIslands({
           Static: () => import('../../a/src/Static'),
         })`,
      )
      const r = auditIslands(f.root)
      const codes = findingCodes(r)
      expect(codes).toContain('never-with-registry-entry')
      const finding = r.findings.find((x) => x.code === 'never-with-registry-entry')!
      expect(finding.message).toContain('Static')
      expect(finding.message).toContain("'never'")
      expect(finding.related).toBeDefined()
      expect(finding.related![0]!.relPath).toContain('Static.tsx')
    } finally {
      f.cleanup()
    }
  })

  it('does NOT flag a registered non-never island (fixed shape)', () => {
    const f = makeFixture()
    try {
      f.write(
        'a/src/Counter.tsx',
        `import { island } from '@pyreon/server'
         const Counter = island(() => import('./CounterInner'), { name: 'Counter', hydrate: 'load' })
         export { Counter }`,
      )
      f.write('a/src/CounterInner.tsx', `export default () => null`)
      f.write(
        'app/src/entry-client.ts',
        `import { hydrateIslands } from '@pyreon/server/client'
         hydrateIslands({ Counter: () => import('../../a/src/Counter') })`,
      )
      const r = auditIslands(f.root)
      expect(findingCodes(r)).not.toContain('never-with-registry-entry')
    } finally {
      f.cleanup()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// registry-mismatch
// ═══════════════════════════════════════════════════════════════════════════════

describe('auditIslands — registry-mismatch', () => {
  it('flags a registry key that has no matching island() declaration (broken shape)', () => {
    const f = makeFixture()
    try {
      f.write(
        'a/src/Counter.tsx',
        `import { island } from '@pyreon/server'
         export const Counter = island(() => import('./CounterInner'), { name: 'Counter', hydrate: 'load' })`,
      )
      f.write('a/src/CounterInner.tsx', `export default () => null`)
      f.write(
        'app/src/entry-client.ts',
        `import { hydrateIslands } from '@pyreon/server/client'
         hydrateIslands({
           Counter: () => import('../../a/src/Counter'),
           Counterr: () => import('../../a/src/Counter'), // typo
         })`,
      )
      const r = auditIslands(f.root)
      const mismatches = r.findings.filter((x) => x.code === 'registry-mismatch')
      expect(mismatches).toHaveLength(1)
      expect(mismatches[0]!.message).toContain('Counterr')
    } finally {
      f.cleanup()
    }
  })

  it('does NOT flag when every key matches a declared name (fixed shape)', () => {
    const f = makeFixture()
    try {
      f.write(
        'a/src/A.tsx',
        `import { island } from '@pyreon/server'
         export const A = island(() => import('./AInner'), { name: 'A', hydrate: 'load' })`,
      )
      f.write('a/src/AInner.tsx', `export default () => null`)
      f.write(
        'app/src/entry-client.ts',
        `import { hydrateIslands } from '@pyreon/server/client'
         hydrateIslands({ A: () => import('../../a/src/A') })`,
      )
      const r = auditIslands(f.root)
      expect(findingCodes(r)).not.toContain('registry-mismatch')
    } finally {
      f.cleanup()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// nested-island
// ═══════════════════════════════════════════════════════════════════════════════

describe('auditIslands — nested-island', () => {
  it('flags an island whose loader-target file ALSO contains an island() (broken shape)', () => {
    const f = makeFixture()
    try {
      f.write(
        'a/src/Outer.tsx',
        `import { island } from '@pyreon/server'
         export const Outer = island(() => import('./Inner'), { name: 'Outer', hydrate: 'load' })`,
      )
      f.write(
        'a/src/Inner.tsx',
        `import { island } from '@pyreon/server'
         export const Inner = island(() => import('./Innermost'), { name: 'Inner', hydrate: 'load' })`,
      )
      f.write('a/src/Innermost.tsx', `export default () => null`)
      f.write(
        'app/src/entry-client.ts',
        `import { hydrateIslands } from '@pyreon/server/client'
         hydrateIslands({
           Outer: () => import('../../a/src/Outer'),
           Inner: () => import('../../a/src/Inner'),
         })`,
      )
      const r = auditIslands(f.root)
      const nested = r.findings.filter((x) => x.code === 'nested-island')
      expect(nested.length).toBeGreaterThanOrEqual(1)
      // The outer's finding should reference Outer's location and
      // related-link the inner's location.
      const outerFinding = nested.find((x) => x.location.relPath.includes('Outer.tsx'))!
      expect(outerFinding).toBeDefined()
      expect(outerFinding.message).toContain('"Outer"')
      expect(outerFinding.message).toContain('"Inner"')
      expect(outerFinding.related).toBeDefined()
      expect(outerFinding.related![0]!.relPath).toContain('Inner.tsx')
    } finally {
      f.cleanup()
    }
  })

  it('does NOT flag a flat island whose target has no island() (fixed shape)', () => {
    const f = makeFixture()
    try {
      f.write(
        'a/src/Counter.tsx',
        `import { island } from '@pyreon/server'
         export const Counter = island(() => import('./CounterImpl'), { name: 'Counter', hydrate: 'load' })`,
      )
      f.write('a/src/CounterImpl.tsx', `export default () => null`)
      const r = auditIslands(f.root)
      expect(findingCodes(r)).not.toContain('nested-island')
    } finally {
      f.cleanup()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// dead-island
// ═══════════════════════════════════════════════════════════════════════════════

describe('auditIslands — dead-island', () => {
  it('flags an island whose containing file is not imported by any other source (broken shape)', () => {
    const f = makeFixture()
    try {
      f.write(
        'a/src/Orphan.tsx',
        `import { island } from '@pyreon/server'
         export const Orphan = island(() => import('./OrphanImpl'), { name: 'Orphan', hydrate: 'load' })`,
      )
      f.write('a/src/OrphanImpl.tsx', `export default () => null`)
      // Nothing imports Orphan.tsx — explicitly orphaned
      const r = auditIslands(f.root)
      const dead = r.findings.filter((x) => x.code === 'dead-island')
      expect(dead).toHaveLength(1)
      expect(dead[0]!.message).toContain('"Orphan"')
    } finally {
      f.cleanup()
    }
  })

  it('does NOT flag an island whose file IS imported (fixed shape — static import)', () => {
    const f = makeFixture()
    try {
      f.write(
        'a/src/Counter.tsx',
        `import { island } from '@pyreon/server'
         export const Counter = island(() => import('./CounterImpl'), { name: 'Counter', hydrate: 'load' })`,
      )
      f.write('a/src/CounterImpl.tsx', `export default () => null`)
      f.write(
        'a/src/index.ts',
        `export { Counter } from './Counter'`,
      )
      const r = auditIslands(f.root)
      expect(findingCodes(r)).not.toContain('dead-island')
    } finally {
      f.cleanup()
    }
  })

  it('does NOT flag an island whose file IS imported via dynamic import (auto-registry shape)', () => {
    const f = makeFixture()
    try {
      f.write(
        'a/src/Counter.tsx',
        `import { island } from '@pyreon/server'
         export const Counter = island(() => import('./CounterImpl'), { name: 'Counter', hydrate: 'load' })`,
      )
      f.write('a/src/CounterImpl.tsx', `export default () => null`)
      // Auto-registry-style dynamic import (mirrors what the vite-plugin
      // emits in the virtual module). Both `app/` and `a/` are under
      // packages/, so the relative import path is `../../a/src/Counter`.
      f.write(
        'app/src/entry-client.ts',
        `import { hydrateIslandsAuto } from '@pyreon/server/client'
         const registry = { Counter: () => import('../../a/src/Counter') }
         hydrateIslandsAuto(registry)`,
      )
      const r = auditIslands(f.root)
      expect(findingCodes(r)).not.toContain('dead-island')
    } finally {
      f.cleanup()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Formatter
// ═══════════════════════════════════════════════════════════════════════════════

describe('formatIslandAudit', () => {
  it('returns a green-light message when no findings are present', () => {
    const f = makeFixture()
    try {
      const r = auditIslands(f.root)
      const text = formatIslandAudit(r)
      expect(text).toContain('No island findings')
    } finally {
      f.cleanup()
    }
  })

  it('groups findings by code and lists locations', () => {
    const f = makeFixture()
    try {
      f.write(
        'a/src/A.tsx',
        `import { island } from '@pyreon/server'
         const A = island(() => import('./AImpl'), { name: 'Dup', hydrate: 'load' })
         export { A }`,
      )
      f.write(
        'b/src/B.tsx',
        `import { island } from '@pyreon/server'
         const B = island(() => import('./BImpl'), { name: 'Dup', hydrate: 'load' })
         export { B }`,
      )
      f.write('a/src/AImpl.tsx', `export default () => null`)
      f.write('b/src/BImpl.tsx', `export default () => null`)
      const r = auditIslands(f.root)
      const text = formatIslandAudit(r)
      expect(text).toContain('## duplicate-name')
      // Both file locations appear in the human-readable output
      expect(text).toContain('A.tsx')
      expect(text).toContain('B.tsx')
    } finally {
      f.cleanup()
    }
  })

  it('emits machine-readable JSON when options.json is true', () => {
    const f = makeFixture()
    try {
      f.write(
        'a/src/Orphan.tsx',
        `import { island } from '@pyreon/server'
         export const Orphan = island(() => import('./Inner'), { name: 'Orphan', hydrate: 'load' })`,
      )
      f.write('a/src/Inner.tsx', `export default () => null`)
      const r = auditIslands(f.root)
      const text = formatIslandAudit(r, { json: true })
      const parsed = JSON.parse(text)
      expect(parsed).toHaveProperty('findings')
      expect(parsed).toHaveProperty('summary')
      expect(parsed.summary.findingsByCode).toBeDefined()
    } finally {
      f.cleanup()
    }
  })

  it('returns a useful error when invoked outside a monorepo', () => {
    const empty = mkdtempSync(join(tmpdir(), 'pyreon-island-audit-no-monorepo-'))
    try {
      const r = auditIslands(empty)
      const text = formatIslandAudit(r)
      expect(text).toContain('No monorepo root found')
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Integration — clean shape produces zero findings
// ═══════════════════════════════════════════════════════════════════════════════

describe('auditIslands — integration', () => {
  it('produces zero findings on a clean realistic islands-showcase shape', () => {
    const f = makeFixture()
    try {
      // Mirror examples/islands-showcase: 5 islands, one per strategy,
      // all with distinct names, all imported via the auto-registry.
      const decl = (name: string, hydrate: string) =>
        `import { island } from '@pyreon/server'
         export const ${name} = island(() => import('./${name}Impl'), { name: '${name}', hydrate: '${hydrate}' })`

      f.write('isl/src/Counter.tsx', decl('Counter', 'load'))
      f.write('isl/src/IdleClock.tsx', decl('IdleClock', 'idle'))
      f.write('isl/src/Visible.tsx', decl('Visible', 'visible'))
      f.write('isl/src/Mobile.tsx', decl('Mobile', 'media((max-width: 600px))'))
      f.write('isl/src/Static.tsx', decl('Static', 'never'))
      f.write('isl/src/CounterImpl.tsx', `export default () => null`)
      f.write('isl/src/IdleClockImpl.tsx', `export default () => null`)
      f.write('isl/src/VisibleImpl.tsx', `export default () => null`)
      f.write('isl/src/MobileImpl.tsx', `export default () => null`)
      f.write('isl/src/StaticImpl.tsx', `export default () => null`)
      f.write(
        'app/src/entry-client.ts',
        `import { hydrateIslandsAuto } from '@pyreon/server/client'
         const registry = {
           // Static is correctly OMITTED — it's hydrate: 'never'
           Counter: () => import('../../isl/src/Counter'),
           IdleClock: () => import('../../isl/src/IdleClock'),
           Visible: () => import('../../isl/src/Visible'),
           Mobile: () => import('../../isl/src/Mobile'),
         }
         hydrateIslandsAuto(registry)`,
      )
      // Static is ALSO referenced (server-side), so it's not dead either.
      f.write(
        'app/src/server.ts',
        `import { Static } from '../../isl/src/Static'
         export { Static }`,
      )
      const r = auditIslands(f.root)
      expect(r.summary.islandsDeclared).toBe(5)
      expect(r.findings).toEqual([])
    } finally {
      f.cleanup()
    }
  })
})
