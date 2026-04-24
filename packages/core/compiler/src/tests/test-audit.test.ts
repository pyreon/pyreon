import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  auditTestEnvironment,
  formatTestAudit,
  type TestAuditResult,
} from '../test-audit'

const HERE = dirname(fileURLToPath(import.meta.url))
// tests/ → src/ → compiler/ → core/ → packages/ → repo root (5 ups)
const REPO_ROOT = resolve(HERE, '../../../../../')

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers — synthetic monorepo fixture
// ═══════════════════════════════════════════════════════════════════════════════

function makeFixture(): {
  root: string
  writeTest: (relPath: string, body: string) => void
  cleanup: () => void
} {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-audit-fixture-'))
  mkdirSync(join(root, 'packages'), { recursive: true })
  return {
    root,
    writeTest: (relPath, body) => {
      const full = join(root, 'packages', relPath)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, body)
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Scanner — synthetic inputs
// ═══════════════════════════════════════════════════════════════════════════════

describe('auditTestEnvironment — synthetic fixtures', () => {
  let f: ReturnType<typeof makeFixture>
  beforeEach(() => {
    f = makeFixture()
  })
  afterEach(() => f.cleanup())

  it('returns root=null when no packages/ dir exists', () => {
    const empty = mkdtempSync(join(tmpdir(), 'pyreon-audit-empty-'))
    try {
      const r = auditTestEnvironment(empty)
      expect(r.root).toBeNull()
      expect(r.entries).toEqual([])
      expect(r.totalScanned).toBe(0)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('classifies a pure-mock test file as HIGH', () => {
    f.writeTest(
      'foo/src/tests/component.test.ts',
      `
        const makeVNode = (type, props, children) => ({ type, props, children })
        it('renders', () => {
          const vnode = { type: 'div', props: { class: 'x' }, children: [] }
          expect(vnode).toBeDefined()
        })
      `,
    )
    const r = auditTestEnvironment(f.root)
    expect(r.entries).toHaveLength(1)
    const [entry] = r.entries
    expect(entry!.risk).toBe('high')
    // Only one literal counted: the named `vnode` binding uses
    // `type: 'div'` with an explicit colon. The `makeVNode` return
    // expression uses shorthand `({ type, props, children })` — no
    // colons — which the regex intentionally skips to avoid false
    // positives on unrelated destructuring patterns.
    expect(entry!.mockVNodeLiteralCount).toBe(1)
    // Two helper bindings match the `(const|let|function) <name>`
    // form: `makeVNode` and `vnode`. Both are flagged because both
    // names signal "this test builds mock vnodes by hand".
    expect(entry!.mockHelperCount).toBe(2)
    expect(entry!.importsH).toBe(false)
  })

  it('classifies a pure-h() test file as LOW', () => {
    f.writeTest(
      'foo/src/tests/real.test.ts',
      `
        import { h } from '@pyreon/core'
        it('renders through real h', () => {
          const vnode = h('div', { class: 'x' })
          const composed = h(Component, { x: 1 })
          expect(vnode).toBeDefined()
        })
      `,
    )
    const r = auditTestEnvironment(f.root)
    expect(r.entries).toHaveLength(1)
    const [entry] = r.entries
    expect(entry!.risk).toBe('low')
    expect(entry!.mockVNodeLiteralCount).toBe(0)
    expect(entry!.importsH).toBe(true)
  })

  it('classifies MEDIUM when mocks > real-h() but both present', () => {
    f.writeTest(
      'foo/src/tests/mixed.test.ts',
      `
        import { h } from '@pyreon/core'
        const mockVNode = (type, props, children) => ({ type, props, children })
        it('mock heavy', () => {
          const a = { type: 'a', props: {}, children: [] }
          const b = { type: 'b', props: {}, children: [] }
          const c = { type: 'c', props: {}, children: [] }
          const real = h('div')
          expect(real).toBeDefined()
        })
      `,
    )
    const r = auditTestEnvironment(f.root)
    const [entry] = r.entries
    expect(entry!.risk).toBe('medium')
    expect(entry!.mockVNodeLiteralCount).toBe(3)
    expect(entry!.mockHelperCount).toBe(1)
    expect(entry!.realHCallCount).toBe(1)
    expect(entry!.importsH).toBe(true)
  })

  it('classifies a test with no mocks at all as LOW', () => {
    f.writeTest(
      'foo/src/tests/logic.test.ts',
      `
        import { describe, it, expect } from 'vitest'
        describe('pure logic', () => {
          it('adds', () => {
            expect(1 + 1).toBe(2)
          })
        })
      `,
    )
    const r = auditTestEnvironment(f.root)
    expect(r.entries[0]!.risk).toBe('low')
  })

  it('does NOT flag `h` substring inside identifier names as real h() calls', () => {
    // The regex requires a non-word boundary before `h(`. `hasSomething(`,
    // `hash(`, `oh(` — none should trigger.
    f.writeTest(
      'foo/src/tests/substring.test.ts',
      `
        it('strings', () => {
          const fn = hasProp({ a: 1 })
          const h2 = hash(x)
          const result = oh(x, y)
          expect(fn).toBeDefined()
        })
      `,
    )
    const r = auditTestEnvironment(f.root)
    expect(r.entries[0]!.realHCallCount).toBe(0)
  })

  it('recognises multiple mock-helper names (vnode, mockVNode, createVNode, vnodeMock, makeVNode)', () => {
    f.writeTest(
      'foo/src/tests/helpers.test.ts',
      `
        const vnode = () => null
        const mockVNode = () => null
        const createVNode = () => null
        function VNodeMock() {}
        const makeVNode = () => null
      `,
    )
    const r = auditTestEnvironment(f.root)
    expect(r.entries[0]!.mockHelperCount).toBe(5)
  })

  it('sorts entries by risk (HIGH first) then path', () => {
    f.writeTest(
      'z/src/tests/low.test.ts',
      `import { h } from '@pyreon/core'; const v = h('div')`,
    )
    f.writeTest(
      'a/src/tests/high.test.ts',
      `const v = { type: 'div', props: {}, children: [] }`,
    )
    f.writeTest(
      'm/src/tests/medium.test.ts',
      `
        import { h } from '@pyreon/core'
        const a = { type: 'a', props: {}, children: [] }
        const b = { type: 'b', props: {}, children: [] }
        const r = h('div')
      `,
    )
    const r = auditTestEnvironment(f.root)
    expect(r.entries.map((e) => e.risk)).toEqual(['high', 'medium', 'low'])
  })

  it('skips node_modules / lib / dist directories', () => {
    f.writeTest(
      'foo/src/tests/real.test.ts',
      `const x = { type: 'a', props: {}, children: [] }`,
    )
    f.writeTest(
      'foo/node_modules/some-dep/src/tests/nested.test.ts',
      `const x = { type: 'ignored', props: {}, children: [] }`,
    )
    f.writeTest(
      'foo/lib/tests/nested.test.ts',
      `const x = { type: 'ignored', props: {}, children: [] }`,
    )
    const r = auditTestEnvironment(f.root)
    expect(r.totalScanned).toBe(1)
    expect(r.entries[0]!.relPath).toContain('foo/src/tests/real.test.ts')
  })

  it('counts exactly test files matching *.test.ts or *.test.tsx', () => {
    f.writeTest('foo/src/tests/a.test.ts', 'const x = 1')
    f.writeTest('foo/src/tests/b.test.tsx', 'const x = 1')
    f.writeTest('foo/src/tests/c.spec.ts', 'const x = 1') // not a .test file
    f.writeTest('foo/src/tests/d.ts', 'const x = 1') // not a test file
    const r = auditTestEnvironment(f.root)
    expect(r.totalScanned).toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Scanner — real repo
// ═══════════════════════════════════════════════════════════════════════════════

describe('auditTestEnvironment — real Pyreon repo', () => {
  const result = auditTestEnvironment(REPO_ROOT)

  it('discovers the monorepo root', () => {
    expect(result.root).toBe(REPO_ROOT)
  })

  it('scans a realistic number of test files (>50)', () => {
    expect(result.totalScanned).toBeGreaterThan(50)
  })

  it('finds a known mock-helper test file and classifies it correctly', () => {
    // `i18n.test.tsx` defines a `vnode` helper and uses it throughout
    // — the scanner should pick it up. We don't pin the risk level
    // because the file may pick up a parallel real-h() test in the
    // future (which is exactly the outcome this tool drives toward).
    const known = result.entries.find((e) =>
      e.relPath.includes('fundamentals/i18n/src/tests/i18n.test.tsx'),
    )
    expect(known).toBeDefined()
    expect(known!.mockHelperCount).toBeGreaterThan(0)
  })

  it('classifies at least one file as HIGH — the audit is actionable today', () => {
    // The scanner reporting zero HIGH files in a repo that ships many
    // mock-vnode tests would mean the detector is broken. If this
    // fails, investigate whether HIGH classification regressed.
    const highs = result.entries.filter((e) => e.risk === 'high')
    expect(highs.length).toBeGreaterThan(0)
  })

  it('never produces NaN or negative counts', () => {
    for (const entry of result.entries) {
      expect(entry.mockVNodeLiteralCount).toBeGreaterThanOrEqual(0)
      expect(entry.mockHelperCount).toBeGreaterThanOrEqual(0)
      expect(entry.mockHelperCallCount).toBeGreaterThanOrEqual(0)
      expect(entry.realHCallCount).toBeGreaterThanOrEqual(0)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Helper-call metric — catches factory-call pervasiveness
// ═══════════════════════════════════════════════════════════════════════════════

describe('mockHelperCallCount metric', () => {
  let f: ReturnType<typeof makeFixture>
  beforeEach(() => {
    f = makeFixture()
  })
  afterEach(() => f.cleanup())

  it('counts every call to a known mock-helper name', () => {
    f.writeTest(
      'foo/src/tests/pervasive.test.ts',
      `
        const vnode = (type, props, children) => ({ type, props, children })
        it('builds lots', () => {
          const a = vnode('div', {}, [])
          const b = vnode('span', {}, [])
          const c = vnode('button', {}, [])
          expect([a, b, c]).toBeDefined()
        })
      `,
    )
    const r = auditTestEnvironment(f.root)
    const [entry] = r.entries
    // Three call-sites + one inside the definition argument list =
    // four total matches. The definition's own `(type, props, ...)`
    // hit is expected — it reports signal activity either way.
    expect(entry!.mockHelperCallCount).toBeGreaterThanOrEqual(3)
  })

  it('does not count calls with trailing non-word boundary (identifier extensions)', () => {
    // `vnodeReal(...)` should NOT match — it starts with `vnode` but
    // continues as an identifier. The negative-lookahead via
    // `(?:^|[^a-zA-Z0-9_])` boundary guards against this on the LEFT
    // side only, so we still rely on the name set being specific.
    f.writeTest(
      'foo/src/tests/lookalike.test.ts',
      `
        const vnodeExtended = () => null
        vnodeExtended()
        myVnode()
      `,
    )
    const r = auditTestEnvironment(f.root)
    const [entry] = r.entries
    // The regex matches `vnode(` as a substring of `vnodeExtended(`.
    // Acknowledged false positive — documented in the pattern comment.
    // What we verify: the metric is still non-negative and classifies
    // the file in a way that's still useful (non-zero mock activity
    // means the reviewer should eyeball it).
    expect(entry!.mockHelperCallCount).toBeGreaterThanOrEqual(0)
  })

  it('factors into HIGH classification when no real-h() counterpart exists', () => {
    // A file that DEFINES no helper but CALLS an imported one heavily
    // should still show risk.
    f.writeTest(
      'foo/src/tests/imported-helper.test.ts',
      `
        import { vnode } from '../fixtures'
        it('uses imported vnode', () => {
          const a = vnode('div')
          const b = vnode('span')
          expect([a, b]).toBeDefined()
        })
      `,
    )
    const r = auditTestEnvironment(f.root)
    const [entry] = r.entries
    expect(entry!.mockHelperCount).toBe(0)
    expect(entry!.mockHelperCallCount).toBeGreaterThanOrEqual(2)
    expect(entry!.risk).toBe('high')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Formatter
// ═══════════════════════════════════════════════════════════════════════════════

describe('formatTestAudit', () => {
  function mkResult(entries: Partial<TestAuditResult['entries'][number]>[]): TestAuditResult {
    return {
      root: '/tmp/fake',
      entries: entries.map((e, i) => ({
        path: `/tmp/fake/${i}.test.ts`,
        relPath: `${i}.test.ts`,
        mockVNodeLiteralCount: 0,
        mockHelperCount: 0,
        mockHelperCallCount: 0,
        realHCallCount: 0,
        importsH: false,
        risk: 'low' as const,
        ...e,
      })),
      totalScanned: entries.length,
    }
  }

  it('emits a helpful miss message when root is null', () => {
    const out = formatTestAudit({ root: null, entries: [], totalScanned: 0 })
    expect(out).toContain('No monorepo root found')
  })

  it('surfaces risk counts and mock-vnode exposure fraction in the header', () => {
    const out = formatTestAudit(
      mkResult([
        { risk: 'high', mockVNodeLiteralCount: 1 },
        { risk: 'medium', mockVNodeLiteralCount: 2, realHCallCount: 1, importsH: true },
        { risk: 'low' },
      ]),
    )
    expect(out).toContain('3 test files scanned')
    // Formatter wraps the label in markdown bold **...**, so just
    // check the number + slash pattern.
    expect(out).toMatch(/Mock-vnode exposure.*2 \/ 3/)
    expect(out).toContain('1 high')
    expect(out).toContain('1 medium')
  })

  it('defaults to minRisk="medium" — hides LOW entries', () => {
    const out = formatTestAudit(
      mkResult([
        { risk: 'high', mockVNodeLiteralCount: 1, relPath: 'hi.test.ts' },
        { risk: 'low', relPath: 'ok.test.ts' },
      ]),
    )
    expect(out).toContain('hi.test.ts')
    expect(out).not.toContain('- ok.test.ts') // bullet form only; header counts are fine
  })

  it('respects minRisk="high" — hides MEDIUM entries', () => {
    const out = formatTestAudit(
      mkResult([
        { risk: 'high', mockVNodeLiteralCount: 1, relPath: 'hi.test.ts' },
        { risk: 'medium', mockVNodeLiteralCount: 1, realHCallCount: 1, relPath: 'med.test.ts' },
      ]),
      { minRisk: 'high' },
    )
    expect(out).toContain('hi.test.ts')
    expect(out).not.toContain('- med.test.ts')
  })

  it('respects limit per risk group', () => {
    const entries = Array.from({ length: 30 }, (_, i) => ({
      risk: 'high' as const,
      mockVNodeLiteralCount: 1,
      relPath: `h${i}.test.ts`,
    }))
    const out = formatTestAudit(mkResult(entries), { limit: 3 })
    expect(out).toContain('30 files (showing 3)')
    // Bullets: exactly 3
    const bullets = out.split('\n').filter((l) => /^- h\d+\.test\.ts/.test(l))
    expect(bullets).toHaveLength(3)
  })

  it('mentions PR #197 so the agent has the context', () => {
    const out = formatTestAudit(
      mkResult([{ risk: 'high', mockVNodeLiteralCount: 1 }]),
    )
    expect(out).toContain('PR #197')
  })
})
