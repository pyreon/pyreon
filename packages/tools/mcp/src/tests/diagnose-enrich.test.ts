import { detectPyreonPatterns, diagnoseError } from '@pyreon/compiler'
import type { AntiPatternEntry } from '../anti-patterns'
import {
  type DiagnoseInput,
  type EnrichDeps,
  enrichDiagnosis,
  formatEnrichedDiagnosis,
} from '../diagnose-enrich'

// Real compiler functions — not mocked. The whole point of v2 is that it
// reasons over the REAL detectors; mocking them would test the mock.
const realDeps = (antiPatterns: AntiPatternEntry[] = []): EnrichDeps => ({
  diagnoseError,
  detectPyreonPatterns,
  antiPatterns,
})

const ap = (over: Partial<AntiPatternEntry>): AntiPatternEntry => ({
  name: 'Destructuring props',
  category: 'reactivity',
  categoryHeading: 'Reactivity Mistakes',
  description: 'Destructuring props captures getter values once — loses reactivity.\nUse props.x directly.',
  detectorCodes: ['props-destructured'],
  ...over,
})

describe('enrichDiagnosis — backward compatibility (string-only)', () => {
  test('error-only with a known pattern → string-only, pattern matched', () => {
    const r = enrichDiagnosis({ error: 'count is not a function' }, realDeps())
    expect(r.contextLevel).toBe('string-only')
    expect(r.patternDiagnosis).not.toBeNull()
    expect(r.detectorHits).toEqual([])
    expect(r.relatedAntiPatterns).toEqual([])
    expect(r.reactiveNarrative).toBeNull()
  })

  test('error-only with no pattern → string-only, null diagnosis', () => {
    const r = enrichDiagnosis(
      { error: 'totally unfamiliar nonsense xyzzy' },
      realDeps(),
    )
    expect(r.contextLevel).toBe('string-only')
    expect(r.patternDiagnosis).toBeNull()
  })

  test('formatter output for string-only matched pattern is the v1 block (no enrichment sections)', () => {
    const input: DiagnoseInput = { error: 'count is not a function' }
    const out = formatEnrichedDiagnosis(input, enrichDiagnosis(input, realDeps()))
    expect(out).toContain('**Cause:**')
    expect(out).toContain('**Fix:**')
    expect(out).not.toContain('### Static detector findings')
    expect(out).not.toContain('### Reactive run-up')
    expect(out).not.toContain('---')
  })

  test('formatter output for string-only no-match is the exact v1 fallback block', () => {
    const input: DiagnoseInput = { error: 'xyzzy nothing matches' }
    const out = formatEnrichedDiagnosis(input, enrichDiagnosis(input, realDeps()))
    expect(out).toBe(
      `Could not identify a Pyreon-specific pattern in this error.\n\nError: xyzzy nothing matches\n\nSuggestions:\n- Check for typos in variable/function names\n- Verify all imports are correct\n- Run \`bun run typecheck\` for full TypeScript diagnostics\n- Run \`pyreon doctor\` for project-wide health check`,
    )
  })
})

describe('enrichDiagnosis — componentSource detector enrichment', () => {
  test('runs detectPyreonPatterns and surfaces hits', () => {
    // Signature-destructured props ({ value }) is the props-destructured
    // detector's shape — it captures getter values once at setup.
    const componentSource = `function C({ value }: { value: string }) {
  return <div>{value}</div>
}`
    const r = enrichDiagnosis(
      { error: 'value is undefined', componentSource },
      realDeps(),
    )
    expect(r.contextLevel).toBe('enriched')
    expect(r.detectorHits.length).toBeGreaterThan(0)
    expect(r.detectorHits.map((d) => d.code)).toContain('props-destructured')
  })

  test('maps detector hits to anti-pattern catalog via detectorCodes bridge', () => {
    const componentSource = `function C({ value }: { value: string }) {
  return <div>{value}</div>
}`
    const antiPatterns = [
      ap({ name: 'Destructuring props', detectorCodes: ['props-destructured'] }),
      ap({ name: 'Unrelated entry', detectorCodes: ['for-missing-by'] }),
    ]
    const r = enrichDiagnosis(
      { error: 'x', componentSource },
      realDeps(antiPatterns),
    )
    expect(r.relatedAntiPatterns.map((e) => e.name)).toEqual(['Destructuring props'])
  })

  test('dedupes anti-pattern entries when multiple hits point to the same entry', () => {
    const componentSource = `function A({ a }: { a: string }) { return <div>{a}</div> }
function B({ b }: { b: string }) { return <span>{b}</span> }`
    const antiPatterns = [ap({ name: 'Destructuring props', detectorCodes: ['props-destructured'] })]
    const r = enrichDiagnosis({ error: 'x', componentSource }, realDeps(antiPatterns))
    expect(r.detectorHits.length).toBeGreaterThanOrEqual(2)
    expect(r.relatedAntiPatterns).toHaveLength(1) // deduped by name
  })

  test('clean component → enriched level but no detector hits / anti-patterns', () => {
    const componentSource = `function C(props: { value: string }) {
  return <div>{props.value}</div>
}`
    const r = enrichDiagnosis(
      { error: 'x', componentSource },
      realDeps([ap({})]),
    )
    expect(r.contextLevel).toBe('enriched')
    expect(r.detectorHits).toEqual([])
    expect(r.relatedAntiPatterns).toEqual([])
  })

  test('whitespace-only componentSource is treated as not-supplied', () => {
    const r = enrichDiagnosis({ error: 'x', componentSource: '   \n  ' }, realDeps())
    expect(r.contextLevel).toBe('string-only')
  })
})

describe('enrichDiagnosis — reactiveTrace narrative', () => {
  test('formats the causal sequence chronologically', () => {
    const r = enrichDiagnosis(
      {
        error: 'boom',
        reactiveTrace: [
          { name: 'status', prev: '"idle"', next: '"submitting"', timestamp: 1 },
          { name: undefined, prev: 'null', next: 'User {id}', timestamp: 2 },
        ],
      },
      realDeps(),
    )
    expect(r.contextLevel).toBe('enriched')
    expect(r.reactiveNarrative).toContain('status: "idle" → "submitting"')
    expect(r.reactiveNarrative).toContain('(anonymous signal): null → User {id}')
  })

  test('empty reactiveTrace → narrative null, string-only level', () => {
    const r = enrichDiagnosis({ error: 'boom', reactiveTrace: [] }, realDeps())
    expect(r.reactiveNarrative).toBeNull()
    expect(r.contextLevel).toBe('string-only')
  })

  test('over-long trace is capped and notes omission', () => {
    const trace = Array.from({ length: 70 }, (_, i) => ({
      name: 's',
      prev: String(i),
      next: String(i + 1),
      timestamp: i,
    }))
    const r = enrichDiagnosis({ error: 'boom', reactiveTrace: trace }, realDeps())
    expect(r.reactiveNarrative).toContain('last 50 of 70')
    expect(r.reactiveNarrative).toContain('20 older omitted')
  })

  test('formatter renders enrichment sections only when context is supplied', () => {
    const input: DiagnoseInput = {
      error: 'count is not a function',
      reactiveTrace: [{ name: 'count', prev: '0', next: '1', timestamp: 1 }],
    }
    const out = formatEnrichedDiagnosis(input, enrichDiagnosis(input, realDeps()))
    // v1 base still present...
    expect(out).toContain('**Cause:**')
    // ...plus the new reactive run-up section
    expect(out).toContain('### Reactive run-up')
    expect(out).toContain('count: 0 → 1')
    expect(out).toContain('---')
  })

  test('structured context that yields nothing emits the honest "no additional findings" note', () => {
    const input: DiagnoseInput = {
      error: 'count is not a function',
      componentSource: 'function C(props: { x: string }){ return <div>{props.x}</div> }',
    }
    const out = formatEnrichedDiagnosis(input, enrichDiagnosis(input, realDeps()))
    expect(out).toContain('no additional findings')
  })
})
