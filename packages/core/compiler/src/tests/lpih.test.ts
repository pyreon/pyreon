/**
 * Live Program Inlay Hints — pure merge-function tests.
 *
 * Proves the end-to-end story: static findings from `analyzeReactivity()`
 * merge with runtime fire data into enriched findings that an LSP can
 * serve as inlay hints. The runtime side is tested separately in
 * `@pyreon/reactivity` (`lpih-source-location.test.ts`).
 */
import { describe, expect, it } from 'vitest'
import { firesToCreationSiteFindings, type LPIHFireDatum, mergeFireDataIntoFindings } from '../lpih'
import { analyzeReactivity } from '../reactivity-lens'
import type { ReactivityFinding } from '../reactivity-lens'

const finding = (
  kind: ReactivityFinding['kind'],
  line: number,
  detail: string,
): ReactivityFinding => ({
  kind,
  line,
  column: 0,
  endLine: line,
  endColumn: 10,
  detail,
})

const fire = (
  file: string,
  line: number,
  count: number,
  kind?: LPIHFireDatum['kind'],
): LPIHFireDatum => ({ file, line, count, kind })

describe('mergeFireDataIntoFindings — basic shape', () => {
  it('passes findings through unchanged when no fires', () => {
    const findings = [finding('reactive', 5, 'live')]
    const out = mergeFireDataIntoFindings(findings, [], 'app.tsx')
    expect(out).toEqual(findings)
    expect(out).toBe(findings) // identity preserved on no-op
  })

  it('passes findings through unchanged when no fires match the file', () => {
    const findings = [finding('reactive', 5, 'live')]
    const out = mergeFireDataIntoFindings(findings, [fire('other.tsx', 5, 3, 'signal')], 'app.tsx')
    expect(out[0]?.detail).toBe('live') // not enriched
  })

  it('enriches a matching reactive finding with the fire count + kind', () => {
    const findings = [finding('reactive', 5, 'live')]
    const out = mergeFireDataIntoFindings(findings, [fire('app.tsx', 5, 240, 'signal')], 'app.tsx')
    expect(out[0]?.detail).toBe('live — signal fired 240×')
  })

  it('does NOT mutate the input findings', () => {
    const findings = [finding('reactive', 5, 'live')]
    const before = findings[0]?.detail
    mergeFireDataIntoFindings(findings, [fire('app.tsx', 5, 240, 'signal')], 'app.tsx')
    expect(findings[0]?.detail).toBe(before) // unchanged
  })
})

describe('mergeFireDataIntoFindings — span-kind filtering', () => {
  it('skips footgun findings (not runtime-active reactive reads)', () => {
    const findings = [finding('footgun', 5, 'props destructured')]
    const out = mergeFireDataIntoFindings(findings, [fire('app.tsx', 5, 5, 'signal')], 'app.tsx')
    expect(out[0]?.detail).toBe('props destructured') // unchanged
  })

  it('skips hoisted-static findings', () => {
    const findings = [finding('hoisted-static', 5, 'hoisted')]
    const out = mergeFireDataIntoFindings(findings, [fire('app.tsx', 5, 5, 'signal')], 'app.tsx')
    expect(out[0]?.detail).toBe('hoisted')
  })

  it('skips static-text findings', () => {
    const findings = [finding('static-text', 5, 'baked')]
    const out = mergeFireDataIntoFindings(findings, [fire('app.tsx', 5, 5, 'signal')], 'app.tsx')
    expect(out[0]?.detail).toBe('baked')
  })

  it('enriches reactive-prop kinds', () => {
    const findings = [finding('reactive-prop', 7, 'reactive prop')]
    const out = mergeFireDataIntoFindings(findings, [fire('app.tsx', 7, 12, 'signal')], 'app.tsx')
    expect(out[0]?.detail).toBe('reactive prop — signal fired 12×')
  })

  it('enriches reactive-attr kinds', () => {
    const findings = [finding('reactive-attr', 9, 'live attr')]
    const out = mergeFireDataIntoFindings(findings, [fire('app.tsx', 9, 3, 'derived')], 'app.tsx')
    expect(out[0]?.detail).toBe('live attr — derived fired 3×')
  })
})

describe('mergeFireDataIntoFindings — aggregation', () => {
  it('sums fires at the same line', () => {
    const findings = [finding('reactive', 5, 'live')]
    const out = mergeFireDataIntoFindings(
      findings,
      [fire('app.tsx', 5, 10, 'signal'), fire('app.tsx', 5, 30, 'signal')],
      'app.tsx',
    )
    expect(out[0]?.detail).toBe('live — signal fired 40×')
  })

  it('uses latest lastFire + corresponding kind when summing', () => {
    const findings = [finding('reactive', 5, 'live')]
    const out = mergeFireDataIntoFindings(
      findings,
      [
        { file: 'app.tsx', line: 5, count: 10, lastFire: 100, kind: 'signal' },
        { file: 'app.tsx', line: 5, count: 5, lastFire: 999, kind: 'derived' },
      ],
      'app.tsx',
    )
    // Latest fire is `derived` at ts=999, so the kind label is 'derived'.
    expect(out[0]?.detail).toBe('live — derived fired 15×')
  })

  it('keeps the earlier kind when incoming fire has no lastFire', () => {
    const findings = [finding('reactive', 5, 'live')]
    const out = mergeFireDataIntoFindings(
      findings,
      [
        { file: 'app.tsx', line: 5, count: 10, lastFire: 100, kind: 'signal' },
        { file: 'app.tsx', line: 5, count: 5, kind: 'derived' }, // no lastFire
      ],
      'app.tsx',
    )
    expect(out[0]?.detail).toBe('live — signal fired 15×')
  })
})

describe('mergeFireDataIntoFindings — file-normalization', () => {
  it('uses normalizeFile to compare paths', () => {
    const findings = [finding('reactive', 5, 'live')]
    const norm = (p: string): string => p.replace(/^.*\//, '')
    const out = mergeFireDataIntoFindings(
      findings,
      [fire('/abs/path/app.tsx', 5, 7, 'signal')],
      'workspace://app.tsx',
      { normalizeFile: norm },
    )
    expect(out[0]?.detail).toBe('live — signal fired 7×')
  })
})

describe('mergeFireDataIntoFindings — custom format', () => {
  it('uses formatDetail when provided', () => {
    const findings = [finding('reactive', 5, 'live')]
    const out = mergeFireDataIntoFindings(findings, [fire('app.tsx', 5, 42, 'signal')], 'app.tsx', {
      formatDetail: (d, f) => `${d} [${f.count}]`,
    })
    expect(out[0]?.detail).toBe('live [42]')
  })
})

describe('firesToCreationSiteFindings — synthetic creation-site hints', () => {
  it('returns empty when no fires', () => {
    expect(firesToCreationSiteFindings([], 'app.tsx')).toEqual([])
  })

  it('produces one finding per unique line', () => {
    const out = firesToCreationSiteFindings(
      [fire('app.tsx', 5, 100, 'signal'), fire('app.tsx', 8, 50, 'derived')],
      'app.tsx',
    )
    expect(out).toHaveLength(2)
    expect(out[0]?.line).toBe(5)
    expect(out[0]?.detail).toBe('signal fired 100×')
    expect(out[1]?.line).toBe(8)
    expect(out[1]?.detail).toBe('derived fired 50×')
  })

  it('aggregates multiple fires on the same line', () => {
    const out = firesToCreationSiteFindings(
      [fire('app.tsx', 5, 100, 'signal'), fire('app.tsx', 5, 50, 'signal')],
      'app.tsx',
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.detail).toBe('signal fired 150×')
  })

  it('skips fires from other files', () => {
    const out = firesToCreationSiteFindings(
      [fire('app.tsx', 5, 100, 'signal'), fire('other.tsx', 5, 50, 'signal')],
      'app.tsx',
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.line).toBe(5)
  })

  it('uses live-fire kind for the synthetic finding', () => {
    const out = firesToCreationSiteFindings([fire('app.tsx', 5, 100, 'signal')], 'app.tsx')
    expect(out[0]?.kind).toBe('live-fire')
  })

  it('sorts findings by line ascending', () => {
    const out = firesToCreationSiteFindings(
      [
        fire('app.tsx', 10, 1, 'signal'),
        fire('app.tsx', 3, 1, 'signal'),
        fire('app.tsx', 7, 1, 'signal'),
      ],
      'app.tsx',
    )
    expect(out.map((f) => f.line)).toEqual([3, 7, 10])
  })

  it('honors normalizeFile for cross-realm paths', () => {
    const out = firesToCreationSiteFindings(
      [fire('/abs/app.tsx', 5, 100, 'signal')],
      'workspace://app.tsx',
      { normalizeFile: (p) => p.replace(/^.*\//, '') },
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.detail).toBe('signal fired 100×')
  })

  it('honors custom formatDetail', () => {
    const out = firesToCreationSiteFindings([fire('app.tsx', 5, 42, 'signal')], 'app.tsx', {
      formatDetail: (_, f) => `🔥 ${f.count}`,
    })
    expect(out[0]?.detail).toBe('🔥 42')
  })
})

describe('end-to-end — analyzeReactivity + merge', () => {
  it('enriches the static analysis output with runtime data', () => {
    const code = `function App() {
  const count = signal(0)
  return <div>{count()}</div>
}`
    const { findings } = analyzeReactivity(code, 'app.tsx')
    // The reactive {count()} span is on line 3.
    const reactiveFinding = findings.find((f) => f.kind === 'reactive' && f.line === 3)
    expect(reactiveFinding).toBeDefined()
    const enriched = mergeFireDataIntoFindings(
      findings,
      [fire('app.tsx', 3, 50, 'signal')],
      'app.tsx',
    )
    const target = enriched.find((f) => f.kind === 'reactive' && f.line === 3)
    expect(target?.detail).toContain('fired 50×')
  })

  it('leaves footguns visible even after merge (LPIH is additive)', () => {
    // `const { x } = props` triggers the props-destructured footgun.
    const code = `function App(props) {
  const { x } = props
  return <div>{x}</div>
}`
    const { findings } = analyzeReactivity(code, 'app.tsx')
    const footgun = findings.find((f) => f.kind === 'footgun')
    expect(footgun).toBeDefined()
    const enriched = mergeFireDataIntoFindings(
      findings,
      [fire('app.tsx', footgun?.line ?? 0, 5, 'signal')],
      'app.tsx',
    )
    const afterFootgun = enriched.find((f) => f.kind === 'footgun')
    expect(afterFootgun?.detail).toBe(footgun?.detail) // unchanged
  })
})

describe('rate1s — label formatting', () => {
  it('omits rate when below threshold (dormant)', () => {
    const findings = [finding('reactive', 5, 'live')]
    const out = mergeFireDataIntoFindings(
      findings,
      [{ file: 'app.tsx', line: 5, count: 100, kind: 'signal', rate1s: 0.1 }],
      'app.tsx',
    )
    expect(out[0]?.detail).toBe('live — signal fired 100×')
    expect(out[0]?.detail).not.toContain('/s')
  })

  it('omits rate when undefined (older runtime / no field)', () => {
    const findings = [finding('reactive', 5, 'live')]
    const out = mergeFireDataIntoFindings(
      findings,
      [{ file: 'app.tsx', line: 5, count: 100, kind: 'signal' }],
      'app.tsx',
    )
    expect(out[0]?.detail).toBe('live — signal fired 100×')
  })

  it('includes 1-decimal rate when above threshold and < 10/s', () => {
    const findings = [finding('reactive', 5, 'live')]
    const out = mergeFireDataIntoFindings(
      findings,
      [{ file: 'app.tsx', line: 5, count: 100, kind: 'signal', rate1s: 3.7 }],
      'app.tsx',
    )
    expect(out[0]?.detail).toBe('live — signal fired 100× (3.7/s)')
  })

  it('rounds rate to integer at >= 10/s', () => {
    const findings = [finding('reactive', 5, 'live')]
    const out = mergeFireDataIntoFindings(
      findings,
      [{ file: 'app.tsx', line: 5, count: 1000, kind: 'signal', rate1s: 47.3 }],
      'app.tsx',
    )
    expect(out[0]?.detail).toBe('live — signal fired 1000× (47/s)')
  })

  it('firesToCreationSiteFindings respects rate1s in label', () => {
    const out = firesToCreationSiteFindings(
      [
        { file: 'app.tsx', line: 5, count: 50, kind: 'signal', rate1s: 5.2 },
        { file: 'app.tsx', line: 8, count: 100, kind: 'effect', rate1s: 0.0 },
      ],
      'app.tsx',
    )
    expect(out).toHaveLength(2)
    expect(out[0]?.detail).toBe('signal fired 50× (5.2/s)')
    expect(out[1]?.detail).toBe('effect fired 100×')
  })

  it('sums rates when multiple fires share the same line', () => {
    const findings = [finding('reactive', 5, 'live')]
    const out = mergeFireDataIntoFindings(
      findings,
      [
        { file: 'app.tsx', line: 5, count: 30, kind: 'signal', rate1s: 2.0 },
        { file: 'app.tsx', line: 5, count: 20, kind: 'signal', rate1s: 3.5 },
      ],
      'app.tsx',
    )
    expect(out[0]?.detail).toBe('live — signal fired 50× (5.5/s)')
  })

  it('custom formatDetail receives rate1s in the fire object', () => {
    const findings = [finding('reactive', 5, 'live')]
    const out = mergeFireDataIntoFindings(
      findings,
      [{ file: 'app.tsx', line: 5, count: 100, kind: 'signal', rate1s: 7.5 }],
      'app.tsx',
      {
        formatDetail: (d, f) => `${d} [rate=${f.rate1s?.toFixed(1) ?? 'n/a'}]`,
      },
    )
    expect(out[0]?.detail).toBe('live [rate=7.5]')
  })
})
