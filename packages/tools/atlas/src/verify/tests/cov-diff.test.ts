/**
 * Reading a baseline catalog back, and what the one-line summary says.
 *
 * `readBaselineScenarios` is deliberately TOLERANT: the baseline is a file on
 * disk that may predate this version, be half-written, or not exist. None of
 * those is a REGRESSION, and conflating "unreadable" with "regressed" would
 * make the very first `--check` run red for everybody — which is how a ratchet
 * gets disabled on day one.
 *
 * The distinction it must NOT lose is the opposite one: a shape it silently
 * accepted as an empty baseline would make every check look newly-gained, and
 * `--check` would report IMPROVED for a catalog it could not read.
 */
import { describe, expect, it } from 'vitest'
import { readBaselineScenarios, diffVerdicts, summarizeDiff } from '../diff'
import { CHECK_KEYS, type CheckKey, type Scenario, type VerifyVerdict } from '../../core/types'
import { emptyVerdict } from '../../plugins/registry'

const verdict = (overrides: Partial<Record<CheckKey, { status: 'pass' | 'fail' | 'skip' }>>): VerifyVerdict => {
  const base = { ...emptyVerdict(), ...overrides } as VerifyVerdict
  const checked = CHECK_KEYS.filter((k) => base[k].status !== 'skip').length
  return { ...base, checked, ok: checked > 0 && CHECK_KEYS.every((k) => base[k].status !== 'fail') }
}

const scenario = (id: string, v?: VerifyVerdict): Scenario =>
  ({ id, component: 'C', name: id, args: {}, source: 'auto-variant', ...(v ? { verify: v } : {}) }) as Scenario

describe('readBaselineScenarios — what it refuses to read', () => {
  it('is UNDEFINED for a non-object, so "unreadable" never reads as "empty"', () => {
    // An empty baseline and an unreadable one produce opposite verdicts: an
    // empty one makes every check look newly GAINED and reports IMPROVED.
    expect(readBaselineScenarios(null)).toBeUndefined()
    expect(readBaselineScenarios('a string')).toBeUndefined()
    expect(readBaselineScenarios(42)).toBeUndefined()
    expect(readBaselineScenarios(undefined)).toBeUndefined()
  })

  it('is UNDEFINED when `components` is missing or not an array', () => {
    expect(readBaselineScenarios({})).toBeUndefined()
    expect(readBaselineScenarios({ components: 'nope' })).toBeUndefined()
    expect(readBaselineScenarios({ components: { Button: {} } })).toBeUndefined()
  })
})

describe('readBaselineScenarios — what it tolerates', () => {
  it('reads an empty catalog as an empty baseline, not as unreadable', () => {
    // A real, well-formed catalog for a project with no components. `[]` and
    // `undefined` are different answers and the caller branches on which.
    expect(readBaselineScenarios({ components: [] })).toEqual([])
  })

  it('SKIPS a component whose scenarios are missing or malformed', () => {
    // A half-written file. Dropping the bad entry keeps the readable half of
    // the baseline usable rather than discarding the whole comparison.
    const read = readBaselineScenarios({
      components: [
        { name: 'A' },
        { name: 'B', scenarios: 'not an array' },
        { name: 'C', scenarios: [{ id: 'c-1' }] },
      ],
    })
    expect(read?.map((s) => s.id)).toEqual(['c-1'])
  })

  it('SKIPS a scenario with no string id — an id is what a diff is keyed on', () => {
    const read = readBaselineScenarios({
      components: [{ scenarios: [{ id: 1 }, {}, null, { id: 'good' }] }],
    })
    expect(read?.map((s) => s.id)).toEqual(['good'])
  })

  it('tolerates a null entry in `components`', () => {
    expect(readBaselineScenarios({ components: [null, undefined] })).toEqual([])
  })

  it('flattens scenarios across every component, in order', () => {
    const read = readBaselineScenarios({
      components: [{ scenarios: [{ id: 'a' }] }, { scenarios: [{ id: 'b' }, { id: 'c' }] }],
    })
    expect(read?.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('summarizeDiff — the improvement wording', () => {
  it('names checks that now PASS without inventing a "newly run" clause', () => {
    // Each half of the improvement summary is conditional: reporting
    // `0 check(s) newly run` alongside a real fix is noise that reads as a
    // second finding.
    const before = [scenario('s1', verdict({ interaction: { status: 'fail' } }))]
    const after = [scenario('s1', verdict({ interaction: { status: 'pass' } }))]
    const text = summarizeDiff(diffVerdicts(before, after))
    expect(text).toContain('IMPROVED')
    expect(text).toContain('now pass')
    expect(text, 'no phantom second clause').not.toContain('newly run')
  })

  it('names checks that newly RUN without claiming any started passing', () => {
    // Coverage GAINED is its own event: a check that went skip → pass is not
    // the same as one that went fail → pass, and the ratchet treats the
    // reverse of each differently.
    const before = [scenario('s1', verdict({}))]
    const after = [scenario('s1', verdict({ interaction: { status: 'pass' } }))]
    const text = summarizeDiff(diffVerdicts(before, after))
    expect(text).toContain('IMPROVED')
    expect(text).toContain('newly run')
  })

  it('reports BOTH clauses when both happened', () => {
    const before = [
      scenario('s1', verdict({ interaction: { status: 'fail' } })),
      scenario('s2', verdict({})),
    ]
    const after = [
      scenario('s1', verdict({ interaction: { status: 'pass' } })),
      scenario('s2', verdict({ leak: { status: 'pass' } })),
    ]
    const text = summarizeDiff(diffVerdicts(before, after))
    expect(text).toContain('now pass')
    expect(text).toContain('newly run')
  })

  it('says plainly when nothing moved', () => {
    const same = [scenario('s1', verdict({ interaction: { status: 'pass' } }))]
    expect(summarizeDiff(diffVerdicts(same, same))).toBe('no change in any check')
  })
})
