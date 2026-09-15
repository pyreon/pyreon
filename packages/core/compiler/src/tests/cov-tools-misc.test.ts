/**
 * Branch-coverage specs for the smaller tool modules — `validate-emit.ts`,
 * `reactivity-lens.ts`, `lpih.ts`, `ts.ts`, `detector-suppression.ts` and
 * `diagnose.ts` — through their public exports.
 *
 * As elsewhere, each arm is asserted with its neighbour: the schema shape the
 * analyzer names beside the one it cannot, the fire datum that carries a
 * `kind` beside the one that does not, the TS build that has the classic
 * Compiler API beside the one that removed it.
 */
import { describe, expect, it } from 'vitest'
import { filterSuppressed } from '../detector-suppression'
import { diagnoseError } from '../diagnose'
import {
  firesToCreationSiteFindings,
  type LPIHFireDatum,
  mergeFireDataIntoFindings,
} from '../lpih'
import {
  analyzeReactivity,
  type AnalyzeReactivityResult,
  formatReactivityLens,
  type ReactivityFinding,
} from '../reactivity-lens'
import { assertClassicTs } from '../ts'
import { analyzeValidate, emitValidator, isEmittable } from '../validate-emit'

// ═══════════════════════════════════════════════════════════════════════════
// ts.ts — the TypeScript 7 guard
// ═══════════════════════════════════════════════════════════════════════════

describe('assertClassicTs', () => {
  it('passes for a module exposing ScriptTarget (the installed TS 5.x/6.x)', () => {
    expect(() => assertClassicTs()).not.toThrow()
    expect(() => assertClassicTs({ version: '6.0.0', ScriptTarget: {} })).not.toThrow()
  })

  it('names the version when a TS7-shaped module reports one', () => {
    expect(() => assertClassicTs({ version: '7.0.2' })).toThrow(/TypeScript 7\.0\.2/)
  })

  it('falls back to a generic label when the module reports NO version', () => {
    expect(() => assertClassicTs({})).toThrow(/an incompatible build/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// detector-suppression
// ═══════════════════════════════════════════════════════════════════════════

describe('filterSuppressed', () => {
  const diag = (code: string, line: number) => ({ code, line })

  it('keeps a diagnostic on LINE 1 — there is no line above it to carry a comment', () => {
    // The source mentions `pyreon-lint-` (so the fast path does not bail),
    // but the diagnostic sits on the first line, where `lines[-1]` is
    // undefined.
    const source = `const x = sig(1)\n// pyreon-lint-ignore some-code\nconst y = 2\n`
    expect(filterSuppressed([diag('a', 1)], source, 'pyreon-patterns')).toHaveLength(1)
  })

  it('drops a diagnostic under a BARE suppression and keeps one under a mismatched id', () => {
    const source = `// pyreon-lint-ignore\nconst x = sig(1)\n`
    expect(filterSuppressed([diag('a', 2)], source, 'pyreon-patterns')).toHaveLength(0)

    const targeted = `// pyreon-lint-ignore other-code\nconst x = sig(1)\n`
    expect(filterSuppressed([diag('a', 2)], targeted, 'pyreon-patterns')).toHaveLength(1)
  })

  it('accepts the bare code AND the gate-prefixed id', () => {
    const bare = `// pyreon-lint-ignore a\nconst x = sig(1)\n`
    expect(filterSuppressed([diag('a', 2)], bare, 'pyreon-patterns')).toHaveLength(0)
    const prefixed = `// pyreon-lint-disable-next-line pyreon-patterns/a\nconst x = sig(1)\n`
    expect(filterSuppressed([diag('a', 2)], prefixed, 'pyreon-patterns')).toHaveLength(0)
  })

  it('short-circuits (and keeps everything) when the source mentions no suppression', () => {
    expect(filterSuppressed([diag('a', 2)], 'const x = 1\nconst y = 2\n', 'p')).toHaveLength(1)
  })

  it('keeps a diagnostic whose preceding line is not a whole-line suppression', () => {
    const source = `const z = 1 // pyreon-lint-ignore a\nconst x = sig(1)\n`
    expect(filterSuppressed([diag('a', 2)], source, 'pyreon-patterns')).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// validate-emit
// ═══════════════════════════════════════════════════════════════════════════

describe('analyzeValidate — declaration-name + chain shapes', () => {
  it('names an identifier declaration and reports null for a destructured one', () => {
    expect(analyzeValidate(`const User = s.object({ a: s.string() })`)[0]?.name).toBe('User')
    expect(analyzeValidate(`const { a } = s.object({ a: s.string() })`)[0]?.name).toBeNull()
  })

  it('ignores a bare `s` reference — a chain with zero segments is not a schema', () => {
    expect(analyzeValidate(`const alias = s`)).toEqual([])
  })

  it('ignores a chain rooted at something other than `s`', () => {
    expect(analyzeValidate(`const x = z.string()`)).toEqual([])
  })

  it('marks a top-level declaration and a nested one differently', () => {
    const top = analyzeValidate(`const A = s.string()`)
    expect(top[0]?.topLevel).toBe(true)
    const nested = analyzeValidate(`function f() { const A = s.string() }`)
    expect(nested[0]?.topLevel).toBe(false)
  })

  it('returns [] rather than throwing for unparseable input', () => {
    expect(analyzeValidate(`const = = =`)).toEqual([])
  })
})

describe('validate-emit — string checks and emit shape', () => {
  it('emits a bare typeof guard for an UNCHECKED string, and an else-block once checked', () => {
    const bare = analyzeValidate(`const A = s.string()`)[0]!
    const bareSrc = emitValidator(bare.node)
    expect(bareSrc).toContain('typeof input !== "string"')
    expect(bareSrc).not.toContain('else {')

    const checked = analyzeValidate(`const A = s.string().min(2)`)[0]!
    expect(emitValidator(checked.node)).toContain('else {')
  })

  it('lowers a LITERAL regex check and declines a non-literal one', () => {
    const literal = analyzeValidate(`const A = s.string().regex(/^a+$/i)`)[0]!
    expect(isEmittable(literal.node)).toBe(true)
    expect(emitValidator(literal.node)).toContain('a+')

    const dynamic = analyzeValidate(`const A = s.string().regex(userPattern)`)[0]!
    expect(isEmittable(dynamic.node)).toBe(false)
    expect(() => emitValidator(dynamic.node)).toThrow(/not emittable/)
  })

  it('reports an unsupported method by name and refuses to emit', () => {
    const info = analyzeValidate(`const A = s.string().mystery()`)[0]!
    expect(isEmittable(info.node)).toBe(false)
    expect(() => emitValidator(info.node)).toThrow(/not emittable/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// reactivity-lens
// ═══════════════════════════════════════════════════════════════════════════

describe('analyzeReactivity + formatReactivityLens', () => {
  it('still returns footguns when the source fails to parse structurally', () => {
    // The transform throws (spans empty) but the TS-API detector runs on its
    // own, so the result is a findings list rather than an exception.
    const r = analyzeReactivity('const = = =', 'broken.tsx')
    expect(r.findings).toEqual([])
  })

  it('surfaces a footgun finding with its detector code', () => {
    const r = analyzeReactivity(`function C({ name }) { return <div>{name}</div> }`, 'c.tsx')
    const f = r.findings.find((x) => x.kind === 'footgun')
    expect(f?.code).toBe('props-destructured')
  })

  /** A result envelope carrying only the findings a format spec cares about. */
  const lensResult = (findings: ReactivityFinding[]): AnalyzeReactivityResult => ({
    findings,
    spans: [],
  })

  it('annotates only the lines that carry findings', () => {
    const code = `const a = 1\nconst b = 2\n`
    const out = formatReactivityLens(
      code,
      lensResult([
        { kind: 'reactive', line: 2, column: 6, endLine: 2, endColumn: 7, detail: 'live b' },
      ]),
    )
    const lines = out.split('\n')
    // Line 1's source row is followed directly by line 2's source row.
    expect(lines[0]).toContain('const a = 1')
    expect(lines[1]).toContain('const b = 2')
    expect(lines[2]).toContain('live b')
  })

  it('renders a finding WITHOUT a code and one WITH a code differently', () => {
    const code = `const a = 1\n`
    const noCode = formatReactivityLens(
      code,
      lensResult([
        { kind: 'reactive', line: 1, column: 0, endLine: 1, endColumn: 1, detail: 'd' },
      ]),
    )
    expect(noCode).not.toContain('[')

    const withCode = formatReactivityLens(
      code,
      lensResult([
        {
          kind: 'footgun',
          line: 1,
          column: 0,
          endLine: 1,
          endColumn: 1,
          detail: 'd',
          code: 'props-destructured',
        },
      ]),
    )
    expect(withCode).toContain('[props-destructured]')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// lpih
// ═══════════════════════════════════════════════════════════════════════════

describe('lpih — fire-data merge + creation-site synthesis', () => {
  const finding = (over: Partial<ReactivityFinding> = {}): ReactivityFinding => ({
    kind: 'reactive',
    line: 3,
    column: 0,
    endLine: 3,
    endColumn: 5,
    detail: 'reads count()',
    ...over,
  })

  it('labels a fire that carries a `kind` and omits the label when it does not', () => {
    const withKind = mergeFireDataIntoFindings(
      [finding()],
      [{ file: 'a.tsx', line: 3, count: 7, kind: 'signal' }],
      'a.tsx',
    )
    expect(withKind[0]?.detail).toContain('signal fired 7')

    const withoutKind = mergeFireDataIntoFindings(
      [finding()],
      [{ file: 'a.tsx', line: 3, count: 7 }],
      'a.tsx',
    )
    expect(withoutKind[0]?.detail).toContain('fired 7')
    expect(withoutKind[0]?.detail).not.toContain('signal')
  })

  it('formats a sub-10/s rate with one decimal and a faster one as an integer', () => {
    const slow = mergeFireDataIntoFindings(
      [finding()],
      [{ file: 'a.tsx', line: 3, count: 7, rate1s: 2.25 }],
      'a.tsx',
    )
    expect(slow[0]?.detail).toContain('(2.3/s)')

    const fast = mergeFireDataIntoFindings(
      [finding()],
      [{ file: 'a.tsx', line: 3, count: 700, rate1s: 42.4 }],
      'a.tsx',
    )
    expect(fast[0]?.detail).toContain('(42/s)')
  })

  it('passes footgun / static findings through unchanged', () => {
    const fires: LPIHFireDatum[] = [{ file: 'a.tsx', line: 3, count: 9, kind: 'signal' }]
    for (const kind of ['footgun', 'hoisted-static', 'static-text'] as const) {
      const out = mergeFireDataIntoFindings([finding({ kind })], fires, 'a.tsx')
      expect(out[0]?.detail).toBe('reads count()')
    }
  })

  it('skips cross-file fires and returns the input untouched when nothing matches', () => {
    const findings = [finding()]
    expect(mergeFireDataIntoFindings(findings, [], 'a.tsx')).toBe(findings)
    expect(
      mergeFireDataIntoFindings(findings, [{ file: 'other.tsx', line: 3, count: 1 }], 'a.tsx'),
    ).toBe(findings)
  })

  it('sorts creation-site findings by LINE, then by column for a tie', () => {
    const out = firesToCreationSiteFindings(
      [
        { file: 'a.tsx', line: 9, count: 1, kind: 'signal' },
        { file: 'a.tsx', line: 2, count: 2, kind: 'derived' },
      ],
      'a.tsx',
    )
    expect(out.map((f) => f.line)).toEqual([2, 9])
    // Every synthesized finding shares column 0, so the tie-break operand is
    // evaluated for any adjacent pair on different lines.
    expect(new Set(out.map((f) => f.column))).toEqual(new Set([0]))
  })

  it('sums counts + rates for two fires on the SAME line and keeps the latest kind', () => {
    const out = firesToCreationSiteFindings(
      [
        { file: 'a.tsx', line: 4, count: 2, rate1s: 1, kind: 'signal', lastFire: 10 },
        { file: 'a.tsx', line: 4, count: 3, rate1s: 2, kind: 'derived', lastFire: 20 },
      ],
      'a.tsx',
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.detail).toContain('derived fired 5')
    expect(out[0]?.detail).toContain('(3.0/s)')
  })

  it('defaults the creation-site label to `node` when the fire has no kind', () => {
    const out = firesToCreationSiteFindings([{ file: 'a.tsx', line: 1, count: 4 }], 'a.tsx')
    expect(out[0]?.detail).toContain('node fired 4')
  })

  it('returns [] for an empty fire list', () => {
    expect(firesToCreationSiteFindings([], 'a.tsx')).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// diagnose — the _ssr helper-skew entry
// ═══════════════════════════════════════════════════════════════════════════

describe('diagnoseError — _ssr helper skew names the missing symbol', () => {
  it('reads the symbol from the FULL message when it sits AFTER the matched phrase', () => {
    const d = diagnoseError(
      `SyntaxError: The requested module '@pyreon/runtime-server' does not provide an export named '_ssrChildren'`,
    )
    expect(d?.cause).toContain('_ssrChildren')
  })

  it('reads the symbol when it sits BEFORE the phrase', () => {
    const d = diagnoseError(`TypeError: _ssrItem is not a function`)
    expect(d?.cause).toContain('_ssrItem')
  })

  it('returns null for a message no pattern claims', () => {
    expect(diagnoseError('Some entirely unrelated failure')).toBeNull()
  })
})
