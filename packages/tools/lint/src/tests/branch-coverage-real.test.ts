/**
 * Real-test branch-coverage hardening for @pyreon/lint.
 * NO v8-ignore annotations.
 */
import { describe, expect, it } from 'vitest'
import { applyFixes, lintFile } from '../runner'
import type { Diagnostic } from '../types'

// ─── applyFixes — edge cases (lines 254, 260, 267) ──────────────────────────

describe('applyFixes — edge cases', () => {
  it('returns source unchanged when no fixable diagnostics (line 254)', () => {
    const source = 'const x = 1'
    const diagnostics: Diagnostic[] = [
      {
        ruleId: 'test/rule',
        severity: 'error',
        message: 'No fix',
        span: { start: 0, end: 5 },
        // No fix property → not fixable
      } as never,
    ]
    const result = applyFixes(source, diagnostics)
    expect(result).toBe(source)
  })

  it('returns source unchanged when diagnostics list is empty', () => {
    expect(applyFixes('const x = 1', [])).toBe('const x = 1')
  })

  it('applies a single fix correctly', () => {
    const source = 'const x = 1'
    const diagnostics: Diagnostic[] = [
      {
        ruleId: 'test/rule',
        severity: 'error',
        message: 'fix me',
        span: { start: 6, end: 7 },
        fix: { span: { start: 6, end: 7 }, replacement: 'y' },
      } as never,
    ]
    const result = applyFixes(source, diagnostics)
    expect(result).toBe('const y = 1')
  })

  it('applies multiple fixes in reverse order to preserve offsets', () => {
    const source = 'aaa bbb ccc'
    const diagnostics: Diagnostic[] = [
      {
        ruleId: 't',
        severity: 'error',
        message: '',
        span: { start: 0, end: 3 },
        fix: { span: { start: 0, end: 3 }, replacement: 'XXX' },
      } as never,
      {
        ruleId: 't',
        severity: 'error',
        message: '',
        span: { start: 8, end: 11 },
        fix: { span: { start: 8, end: 11 }, replacement: 'YYY' },
      } as never,
    ]
    const result = applyFixes(source, diagnostics)
    expect(result).toBe('XXX bbb YYY')
  })

  it('mixed fixable + non-fixable diagnostics applies only the fixable ones', () => {
    const source = 'const x = 1'
    const diagnostics: Diagnostic[] = [
      {
        ruleId: 'unfix',
        severity: 'error',
        message: 'no fix here',
        span: { start: 0, end: 5 },
      } as never,
      {
        ruleId: 'fix',
        severity: 'error',
        message: 'fix me',
        span: { start: 6, end: 7 },
        fix: { span: { start: 6, end: 7 }, replacement: 'y' },
      } as never,
    ]
    const result = applyFixes(source, diagnostics)
    expect(result).toBe('const y = 1')
  })
})

// ─── lintFile — basic surface contracts ─────────────────────────────────────

describe('lintFile — basic contracts', () => {
  it('returns filePath + diagnostics array for a clean file', () => {
    const source = 'const x = 1'
    const result = lintFile('/test/clean.ts', source, [], { rules: {} })
    expect(result.filePath).toBe('/test/clean.ts')
    expect(Array.isArray(result.diagnostics)).toBe(true)
  })

  it('respects an empty rules array (no diagnostics)', () => {
    const source = 'const x: any = 1' // would trip many rules if enabled
    const result = lintFile('/test/empty-rules.ts', source, [], { rules: {} })
    expect(result.diagnostics).toEqual([])
  })

  it('handles .tsx files', () => {
    const source = 'const x = <div>hello</div>'
    const result = lintFile('/test/comp.tsx', source, [], { rules: {} })
    expect(Array.isArray(result.diagnostics)).toBe(true)
  })

  it('handles .js files', () => {
    const source = 'const x = 1'
    const result = lintFile('/test/plain.js', source, [], { rules: {} })
    expect(Array.isArray(result.diagnostics)).toBe(true)
  })

  it('lintFile filePath ending in .d.ts skips lint entirely', () => {
    const source = 'declare const x: number'
    const result = lintFile('/test/types.d.ts', source, [], { rules: {} })
    expect(result.diagnostics).toEqual([])
  })
})
