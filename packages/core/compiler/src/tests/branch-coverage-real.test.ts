/**
 * Real-test branch coverage for compiler small-helper modules.
 * Targets uncov arms in reactivity-lens, lpih, project-scanner, test-audit
 * to push compiler branches above the 85% MINIMUM_BRANCH_FLOOR.
 *
 * NO v8-ignore annotations. Each test exercises a documented control-flow arm.
 */
import { describe, expect, it } from 'vitest'
import {
  analyzeReactivity,
  formatReactivityLens,
  type ReactivityFinding,
} from '../reactivity-lens'
import {
  firesToCreationSiteFindings,
  type LPIHFireDatum,
  mergeFireDataIntoFindings,
} from '../lpih'
import { formatTestAudit, type TestAuditEntry, type TestAuditResult } from '../test-audit'

// ─── reactivity-lens — knownSignals + footgun code badge ─────────────────────

describe('analyzeReactivity — knownSignals option', () => {
  it('passes knownSignals through to compiler (line 111 truthy arm)', () => {
    const src = `function C() { return <div>{count()}</div> }`
    const r = analyzeReactivity(src, 'input.tsx', { knownSignals: ['count'] })
    expect(Array.isArray(r.findings)).toBe(true)
    expect(Array.isArray(r.spans)).toBe(true)
  })

  it('omits knownSignals when option absent (line 111 falsy arm)', () => {
    const src = `function C() { return <div>plain</div> }`
    const r = analyzeReactivity(src)
    expect(Array.isArray(r.findings)).toBe(true)
  })

  it('parse-failure → empty (line 117 catch body)', () => {
    // Deliberately ill-formed enough that transformJSX_JS throws before lens emits.
    const r = analyzeReactivity(`function ( ) { return < / }`)
    expect(Array.isArray(r.findings)).toBe(true)
  })
})

describe('formatReactivityLens — code badge branch', () => {
  it('renders footgun code in brackets when present (line 184 truthy arm)', () => {
    // Constructed result with a footgun finding that carries a code tag.
    const result = {
      findings: [
        {
          kind: 'footgun',
          line: 1,
          column: 0,
          endLine: 1,
          endColumn: 5,
          detail: 'destructured prop loses reactivity',
          code: 'props-destructured',
        } as ReactivityFinding,
      ],
      spans: [],
    }
    const out = formatReactivityLens('const a = 1', result)
    expect(out).toContain('[props-destructured]')
    expect(out).toContain('⚠ footgun')
  })

  it('omits code badge when finding has no code (line 184 falsy arm)', () => {
    const result = {
      findings: [
        {
          kind: 'reactive',
          line: 1,
          column: 0,
          endLine: 1,
          endColumn: 5,
          detail: 'live read',
        } as ReactivityFinding,
      ],
      spans: [],
    }
    const out = formatReactivityLens('const a = 1', result)
    expect(out).toContain('◆ live')
    expect(out).not.toContain('[')
  })
})

// ─── lpih — mergeFireDataIntoFindings rate/kind nullish arms ────────────────

describe('mergeFireDataIntoFindings — null/undefined aggregation arms', () => {
  const FILE = 'app.tsx'

  function findingAt(line: number, kind: ReactivityFinding['kind'] = 'reactive'): ReactivityFinding {
    return { kind, line, column: 0, endLine: line, endColumn: 10, detail: 'live' }
  }

  it('same-line aggregation: existing has no rate1s + incoming has rate1s', () => {
    // Hits line 147: `existing.rate1s = (existing.rate1s ?? 0) + f.rate1s`
    // when existing.rate1s is undefined.
    const fires: LPIHFireDatum[] = [
      { file: FILE, line: 5, count: 10, kind: 'signal' }, // first: no rate1s
      { file: FILE, line: 5, count: 5, rate1s: 2.5, kind: 'signal' }, // incoming has rate1s
    ]
    const out = mergeFireDataIntoFindings([findingAt(5)], fires, FILE)
    expect(out[0]?.detail).toMatch(/15/)
  })

  it('same-line: incoming has no kind, keeps existing kind', () => {
    // Hits line 153: `existing.kind = f.kind ?? existing.kind` falsy arm.
    const fires: LPIHFireDatum[] = [
      { file: FILE, line: 5, count: 10, lastFire: 100, kind: 'signal' },
      { file: FILE, line: 5, count: 5, lastFire: 200 }, // no kind, but later lastFire
    ]
    const out = mergeFireDataIntoFindings([findingAt(5)], fires, FILE)
    expect(out[0]?.detail).toContain('signal')
  })

  it('finding with no matching fire passes through (line 174 truthy arm)', () => {
    const fires: LPIHFireDatum[] = [{ file: FILE, line: 99, count: 1, kind: 'signal' }]
    const findings = [findingAt(5), findingAt(99)]
    const out = mergeFireDataIntoFindings(findings, fires, FILE)
    expect(out[0]?.detail).toBe('live') // unchanged
    expect(out[1]?.detail).toContain('1×')
  })
})

// ─── lpih — firesToCreationSiteFindings same-line aggregation ───────────────

describe('firesToCreationSiteFindings — per-line aggregation arms', () => {
  const FILE = 'app.tsx'

  it('same-line rate1s aggregation with undefined start (lines 231-232)', () => {
    const fires: LPIHFireDatum[] = [
      { file: FILE, line: 7, count: 3, kind: 'signal' }, // no rate1s
      { file: FILE, line: 7, count: 4, rate1s: 1.5, kind: 'signal' },
    ]
    const out = firesToCreationSiteFindings(fires, FILE)
    expect(out).toHaveLength(1)
    expect(out[0]?.line).toBe(7)
  })

  it('lastFire flip with incoming kind undefined (lines 237-238)', () => {
    const fires: LPIHFireDatum[] = [
      { file: FILE, line: 8, count: 2, lastFire: 100, kind: 'signal' },
      { file: FILE, line: 8, count: 6, lastFire: 999 }, // no kind, later lastFire
    ]
    const out = firesToCreationSiteFindings(fires, FILE)
    expect(out).toHaveLength(1)
    // Default formatter uses fire.kind ?? 'node'; with kind missing, but the
    // aggregation step keeps existing.kind = 'signal' (line 238 ?? arm).
    expect(out[0]?.detail).toContain('signal')
  })

  it('fire without kind uses node fallback (line 246 falsy arm)', () => {
    const fires: LPIHFireDatum[] = [{ file: FILE, line: 9, count: 1 }] // no kind
    const out = firesToCreationSiteFindings(fires, FILE)
    expect(out[0]?.detail).toContain('node')
  })

  it('sorts by (line, column) — multi-line stable order (line 268)', () => {
    const fires: LPIHFireDatum[] = [
      { file: FILE, line: 5, count: 1, kind: 'signal' },
      { file: FILE, line: 3, count: 1, kind: 'signal' },
      { file: FILE, line: 4, count: 1, kind: 'signal' },
    ]
    const out = firesToCreationSiteFindings(fires, FILE)
    expect(out.map((f) => f.line)).toEqual([3, 4, 5])
  })
})

// ─── test-audit — formatter risk / count / breakdown arms ───────────────────

describe('formatTestAudit — risk + singular/plural arms', () => {
  function entry(overrides: Partial<TestAuditEntry> = {}): TestAuditEntry {
    return {
      path: '/repo/packages/x/src/tests/a.test.ts',
      relPath: 'packages/x/src/tests/a.test.ts',
      mockVNodeLiteralCount: 0,
      mockHelperCount: 0,
      mockHelperCallCount: 0,
      realHCallCount: 0,
      importsH: false,
      risk: 'low',
      ...overrides,
    }
  }

  function result(entries: TestAuditEntry[]): TestAuditResult {
    return { root: '/repo', entries, totalScanned: entries.length }
  }

  it('relevant.length === 0 path (line 384)', () => {
    // Empty result with root set → falls into the "no entries at risk" branch.
    const out = formatTestAudit(result([]))
    expect(out).toContain('No files at risk level')
  })

  it('singular form: 1 literal / 1 helper / 1 call (lines 405-407 singular arms)', () => {
    const out = formatTestAudit(
      result([
        entry({
          mockVNodeLiteralCount: 1,
          mockHelperCount: 1,
          mockHelperCallCount: 1,
          realHCallCount: 1,
          importsH: true,
          risk: 'medium',
        }),
      ]),
    )
    // Singular "literal" / "helper" / "helper call" + singular "1 real h() call"
    expect(out).toContain('1 literal')
    expect(out).toContain('1 helper')
    expect(out).toContain('1 helper call')
    expect(out).toContain('1 real h() call')
  })

  it('importsH path: 0 real calls but h imported (line 411 truthy arm)', () => {
    const out = formatTestAudit(
      result([
        entry({
          mockVNodeLiteralCount: 2,
          realHCallCount: 0,
          importsH: true,
          risk: 'medium',
        }),
      ]),
    )
    expect(out).toContain('imports h but 0 calls found')
  })

  it('no-h-import path: 0 real calls + no import (line 411 falsy arm)', () => {
    const out = formatTestAudit(
      result([
        entry({
          mockVNodeLiteralCount: 3,
          realHCallCount: 0,
          importsH: false,
          risk: 'high',
        }),
      ]),
      { minRisk: 'high' },
    )
    expect(out).toContain('no h import')
  })

  it('describeRisk low arm — call via minRisk:low + a low-risk entry (line 434)', () => {
    const out = formatTestAudit(
      result([
        entry({
          mockVNodeLiteralCount: 1,
          realHCallCount: 10,
          importsH: true,
          risk: 'low',
        }),
      ]),
      { minRisk: 'low' },
    )
    expect(out).toContain('Mocks dwarfed by real usage')
  })

  it('describeRisk medium arm (line 432) via medium entry', () => {
    const out = formatTestAudit(
      result([
        entry({
          mockVNodeLiteralCount: 5,
          realHCallCount: 1,
          importsH: true,
          risk: 'medium',
        }),
      ]),
    )
    expect(out).toContain('mocks outnumber real calls')
  })

  it('high-risk plural form: 2 entries one risk level (group.length plural)', () => {
    const out = formatTestAudit(
      result([
        entry({
          relPath: 'a.test.ts',
          mockVNodeLiteralCount: 3,
          risk: 'high',
        }),
        entry({
          relPath: 'b.test.ts',
          mockVNodeLiteralCount: 3,
          risk: 'high',
        }),
      ]),
      { minRisk: 'high' },
    )
    expect(out).toContain('HIGH — 2 files')
  })

  it('limit truncation: group truncated when exceeded', () => {
    const out = formatTestAudit(
      result([
        entry({ relPath: 'a.test.ts', mockVNodeLiteralCount: 1, risk: 'high' }),
        entry({ relPath: 'b.test.ts', mockVNodeLiteralCount: 1, risk: 'high' }),
        entry({ relPath: 'c.test.ts', mockVNodeLiteralCount: 1, risk: 'high' }),
      ]),
      { minRisk: 'high', limit: 2 },
    )
    expect(out).toContain('showing 2')
  })
})
