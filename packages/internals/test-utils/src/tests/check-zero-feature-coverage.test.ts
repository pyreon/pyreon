import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkCoverage,
  extractHeadings,
  type GateInput,
  verifyModesCells,
} from '../../../../../scripts/check-zero-feature-coverage'

const ROOT = resolve(__dirname, '../../../../..')

function input(over: Partial<GateInput> = {}): GateInput {
  return {
    headings: ['A', 'B', 'C'],
    registry: { A: { kind: 'e2e', spec: 'e2e/a.spec.ts', evidence: 'does A' } },
    nonFeature: { C: 'container' },
    allowlist: { B: 'no built test exercises B yet' },
    baseAllowlist: ['B'],
    readFile: (p) => (p === 'e2e/a.spec.ts' ? "test('does A', () => {})" : null),
    verifyModes: new Map(),
    ...over,
  }
}

describe('check-zero-feature-coverage — pure gate', () => {
  it('passes when every heading is covered, allowlisted, or structure', () => {
    expect(checkCoverage(input())).toEqual([])
  })

  it('fails on a documented feature with neither a test nor an allowlist entry', () => {
    const p = checkCoverage(input({ headings: ['A', 'B', 'C', 'D'] }))
    expect(p.join()).toContain('documented feature "D" has no real-build test')
  })

  it('fails when the spec no longer contains its evidence (test deleted, file kept)', () => {
    const p = checkCoverage(input({ readFile: () => "test('something else')" }))
    expect(p.join()).toContain('no longer contains evidence "does A"')
  })

  it('fails when the spec file is gone', () => {
    expect(checkCoverage(input({ readFile: () => null })).join()).toContain('does not exist')
  })

  it('RATCHET: fails when the allowlist grows relative to the base ref', () => {
    const p = checkCoverage(
      input({ headings: ['A', 'B', 'C', 'D'], allowlist: { B: 'reason for B here', D: 'reason for D here' } }),
    )
    expect(p.join()).toContain('allowlist grew: "D"')
  })

  it('shrinking the allowlist is allowed', () => {
    const p = checkCoverage(
      input({
        registry: {
          A: { kind: 'e2e', spec: 'e2e/a.spec.ts', evidence: 'does A' },
          B: { kind: 'e2e', spec: 'e2e/a.spec.ts', evidence: 'does A' },
        },
        allowlist: {},
      }),
    )
    expect(p).toEqual([])
  })

  it('fails when a feature is both covered and allowlisted', () => {
    const p = checkCoverage(
      input({ registry: { ...input().registry, B: { kind: 'e2e', spec: 'e2e/a.spec.ts', evidence: 'does A' } } }),
    )
    expect(p.join()).toContain('"B" is listed in more than one')
  })

  it('fails on stale keys (heading renamed)', () => {
    const p = checkCoverage(input({ headings: ['A2', 'B', 'C'] }))
    expect(p.join()).toContain('registry entry "A" no longer matches a heading')
  })

  it('fails on a reasonless allowlist entry', () => {
    expect(checkCoverage(input({ allowlist: { B: '' } })).join()).toContain('needs a reason')
  })

  it('verify-modes coverage requires the evidence INSIDE the matching cell', () => {
    const vm = verifyModesCells(`const MATRIX = [
  {
    example: 'x',
    mode: 'ssr',
    check: () => has('marker-1'),
  },
  {
    example: 'y',
    mode: 'ssr',
    check: () => has('marker-2'),
  },
]`)
    const reg = (evidence: string): GateInput['registry'] => ({
      A: { kind: 'verify-modes', example: 'x', mode: 'ssr', evidence },
    })
    expect(checkCoverage(input({ registry: reg('marker-1'), verifyModes: vm }))).toEqual([])
    // marker-2 exists in the file but in a DIFFERENT cell — not coverage.
    expect(checkCoverage(input({ registry: reg('marker-2'), verifyModes: vm })).join()).toContain(
      'no verify-modes cell x:ssr contains evidence',
    )
  })

  it('extractHeadings ignores headings inside fenced code', () => {
    expect(extractHeadings('## Real\n```md\n## Fake\n```\n### Also real')).toEqual(['Real', 'Also real'])
  })
})

describe('check-zero-feature-coverage — against the real repo', () => {
  it('the real verify-modes MATRIX parses into cells (the gate is not vacuous)', () => {
    const cells = verifyModesCells(readFileSync(resolve(ROOT, 'scripts/verify-modes.ts'), 'utf-8'))
    expect(cells.size).toBeGreaterThan(10)
    expect(cells.has('ssr-showcase:ssr')).toBe(true)
  })

  it('the real zero.md yields headings', () => {
    const h = extractHeadings(readFileSync(resolve(ROOT, 'docs/src/content/docs/zero.md'), 'utf-8'))
    expect(h.length).toBeGreaterThan(40)
    expect(h).toContain('Server Actions')
  })
})
