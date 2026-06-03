/**
 * Real-test branch-coverage hardening for @pyreon/cli.
 * NO v8-ignore annotations.
 */
import { describe, expect, it } from 'vitest'
import { renderText } from '../doctor/render'
import type { DoctorReport, Finding, GateResult } from '../doctor/types'

const stripAnsi = (s: string): string =>
  s.replace(/\[[0-9;]*m/g, '').replace(/\][^]*\\/g, '')

const finding = (extra: Partial<Finding> = {}): Finding => ({
  severity: 'error',
  category: 'correctness',
  code: 'test-code',
  gate: 'test-gate',
  message: 'Test finding',
  ...extra,
})

const gate = (extra: Partial<GateResult> = {}): GateResult => ({
  meta: { id: 'test', name: 'Test', category: 'correctness', speed: 'fast', included: true },
  findings: [],
  durationMs: 0,
  status: 'completed',
  ...extra,
})

const report = (gates: GateResult[]): DoctorReport => {
  const allFindings = gates.flatMap((g) => g.findings)
  const errors = allFindings.filter((f) => f.severity === 'error').length
  const warnings = allFindings.filter((f) => f.severity === 'warning').length
  const infos = allFindings.filter((f) => f.severity === 'info').length

  return {
    score: 100,
    grade: 'A',
    overall: { score: 100, errors, warnings, infos },
    categories: [],
    findings: allFindings,
    totals: { errors, warnings, infos },
    gates,
    elapsedMs: 100,
    timestamp: '2025-01-01T00:00:00Z',
  }
}

// ─── renderText — finding location branches (lines 127-130) ──────────────────

describe('renderText — finding location formatting', () => {
  it('renders a finding without location (line 127 false)', () => {
    const f = finding()
    const out = stripAnsi(renderText(report([gate({ findings: [f] })])))
    expect(out).toContain('Test finding')
  })

  it('renders a finding with location.path only (line 129 line undefined)', () => {
    const f = finding({ location: { path: '/abs/foo.ts' } })
    const out = stripAnsi(renderText(report([gate({ findings: [f] })])))
    expect(out).toContain('foo.ts')
  })

  it('renders a finding with location.line (no column — line 130 false)', () => {
    const f = finding({ location: { path: '/abs/bar.ts', line: 42 } })
    const out = stripAnsi(renderText(report([gate({ findings: [f] })])))
    expect(out).toContain('bar.ts')
    expect(out).toContain('42')
  })

  it('renders a finding with location.line + column (line 130 true)', () => {
    const f = finding({ location: { path: '/abs/baz.ts', line: 42, column: 7 } })
    const out = stripAnsi(renderText(report([gate({ findings: [f] })])))
    expect(out).toContain('baz.ts')
    expect(out).toContain('42')
    expect(out).toContain('7')
  })

  it('renders a finding with location.relPath (uses relPath over path)', () => {
    const f = finding({ location: { path: '/abs/foo.ts', relPath: 'src/foo.ts', line: 1 } })
    const out = stripAnsi(renderText(report([gate({ findings: [f] })])))
    expect(out).toContain('src/foo.ts')
  })

  it('renders relatedLocations (lines 140-147)', () => {
    const f = finding({
      location: { path: '/abs/a.ts', line: 1 },
      relatedLocations: [
        { path: '/abs/b.ts', line: 5, label: 'used here' },
        { path: '/abs/c.ts' }, // no line, no label
      ],
    })
    const out = stripAnsi(renderText(report([gate({ findings: [f] })])))
    expect(out).toContain('a.ts')
    expect(out).toContain('b.ts')
    expect(out).toContain('c.ts')
    expect(out).toContain('used here')
  })

  it('renders fix suggestion when finding.fix is set', () => {
    const f = finding({ fix: 'Try doing X instead' })
    const out = stripAnsi(renderText(report([gate({ findings: [f] })])))
    expect(out).toContain('Try doing X instead')
  })
})

// ─── renderText — severity icons (line 78) ──────────────────────────────────

describe('renderText — severity rendering', () => {
  it('renders error / warning / info findings with distinct icons', () => {
    const r = report([
      gate({
        findings: [
          finding({ severity: 'error', code: 'e1', message: 'Err' }),
          finding({ severity: 'warning', code: 'w1', message: 'Warn' }),
          finding({ severity: 'info', code: 'i1', message: 'Info' }),
        ],
      }),
    ])
    const out = stripAnsi(renderText(r))
    expect(out).toContain('Err')
    expect(out).toContain('Warn')
    expect(out).toContain('Info')
  })
})

// ─── renderText — clean gate (no findings) ──────────────────────────────────

describe('renderText — clean state', () => {
  it('renders empty findings list cleanly', () => {
    const r = report([gate({ findings: [] })])
    const out = stripAnsi(renderText(r))
    expect(out).toBeTruthy()
  })

  it('renders multiple gates each with findings', () => {
    const r = report([
      gate({ meta: { id: 'a', name: 'A', category: 'correctness', speed: 'fast', included: true }, findings: [finding({ code: 'a1' })] }),
      gate({ meta: { id: 'b', name: 'B', category: 'architecture', speed: 'fast', included: true }, findings: [finding({ code: 'b1' })] }),
    ])
    const out = stripAnsi(renderText(r))
    expect(out).toContain('a1')
    expect(out).toContain('b1')
  })
})

// ─── doc-claims gate edges ──────────────────────────────────────────────────

describe('doc-claims — checker edge cases', () => {
  it('checker handles a missing CLAUDE.md gracefully', async () => {
    const { runDocClaimsGate } = await import('../doctor/gates/doc-claims')
    const result = await runDocClaimsGate({ cwd: '/tmp/nonexistent-doc-claims-test' })
    expect(result).toBeDefined()
    expect(Array.isArray(result.findings)).toBe(true)
  })
})

// ─── check-dedup gate edges ─────────────────────────────────────────────────

describe('check-dedup — file presence + parsing edges', () => {
  it('check-dedup handles missing files gracefully', async () => {
    const { runCheckDedupGate } = await import('../doctor/gates/check-dedup')
    const result = await runCheckDedupGate({ cwd: '/tmp/nonexistent-dedup-test' })
    expect(result).toBeDefined()
    expect(Array.isArray(result.findings)).toBe(true)
  })

  it('check-dedup _parseBunLock parses minimal lockfile', async () => {
    const { _parseBunLock } = await import('../doctor/gates/check-dedup')
    const map = _parseBunLock('{"version":"1","packages":{}}')
    expect(map).toBeInstanceOf(Map)
  })

  it('check-dedup _parseNpmLock parses minimal lockfile', async () => {
    const { _parseNpmLock } = await import('../doctor/gates/check-dedup')
    const map = _parseNpmLock('{"lockfileVersion":3,"packages":{}}')
    expect(map).toBeInstanceOf(Map)
  })

  it('check-dedup _parsePnpmLock parses minimal lockfile', async () => {
    const { _parsePnpmLock } = await import('../doctor/gates/check-dedup')
    const map = _parsePnpmLock('lockfileVersion: 6.0\npackages: {}')
    expect(map).toBeInstanceOf(Map)
  })

  it('check-dedup _detectDuplicates finds duplicates across packages', async () => {
    const { _detectDuplicates } = await import('../doctor/gates/check-dedup')
    const map = new Map([
      ['@pyreon/x', { name: '@pyreon/x', versions: new Set(['1.0.0', '2.0.0']) }],
    ])
    const findings = _detectDuplicates(map as never, '/path/to/lockfile', '/path/to')
    expect(Array.isArray(findings)).toBe(true)
    expect(findings.length).toBe(1)
  })

  it('check-dedup _detectDuplicates returns empty when no duplicates', async () => {
    const { _detectDuplicates } = await import('../doctor/gates/check-dedup')
    const map = new Map([
      ['@pyreon/x', { name: '@pyreon/x', versions: new Set(['1.0.0']) }],
    ])
    const findings = _detectDuplicates(map as never, '/path/to/lockfile', '/path/to')
    expect(findings).toEqual([])
  })
})
