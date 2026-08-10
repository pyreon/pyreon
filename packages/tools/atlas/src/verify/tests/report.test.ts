import type { Scenario, VerifyCheck, VerifyVerdict } from '../../core/types'
import { CHECK_KEYS, type CheckKey, emptyVerdict } from '../../plugins/registry'
import {
  buildVerifyReport,
  formatCheckTally,
  formatFailures,
  formatNotRun,
} from '../report'

const pass: VerifyCheck = { status: 'pass' }
const fail = (...findings: string[]): VerifyCheck => ({ status: 'fail', findings })

/** A verdict with the named checks overridden, and `ok`/`checked` DERIVED. */
function verdict(overrides: Partial<Record<CheckKey, VerifyCheck>>): VerifyVerdict {
  const base = { ...emptyVerdict(), ...overrides }
  const checked = CHECK_KEYS.filter((k) => base[k].status !== 'skip').length
  return { ...base, checked, ok: checked > 0 && CHECK_KEYS.every((k) => base[k].status !== 'fail') }
}

function scenario(id: string, verify?: VerifyVerdict): Scenario {
  return {
    id,
    component: id.split('--')[0] ?? id,
    name: id,
    args: {},
    source: 'auto-variant',
    ...(verify ? { verify } : {}),
  }
}

describe('buildVerifyReport', () => {
  it('counts a scenario that passed something as verified', () => {
    const report = buildVerifyReport([scenario('b--a', verdict({ interaction: pass }))])
    expect(report).toMatchObject({ scenarios: 1, verified: 1, failed: 0, unverified: 0 })
  })

  it('counts a verdict where NOTHING ran as unverified, not verified', () => {
    // The distinction the whole catalog is built on: `checked: 0` is not a
    // clean pass, and reporting it as one is how an agent gets told something
    // was verified when nothing looked at it.
    const report = buildVerifyReport([scenario('b--a', emptyVerdict())])
    expect(report).toMatchObject({ verified: 0, failed: 0, unverified: 1 })
  })

  it('treats a MISSING verdict as unverified rather than inventing a third state', () => {
    const report = buildVerifyReport([scenario('b--a')])
    expect(report).toMatchObject({ verified: 0, failed: 0, unverified: 1 })
    expect(report.tallies.every((t) => t.skip === 1)).toBe(true)
  })

  it('counts a scenario with any failing check as failed, even if others passed', () => {
    const report = buildVerifyReport([
      scenario('b--a', verdict({ interaction: pass, a11y: fail('no accessible name') })),
    ])
    expect(report).toMatchObject({ verified: 0, failed: 1, unverified: 0 })
  })

  it('tallies pass/fail/skip per check across scenarios', () => {
    const report = buildVerifyReport([
      scenario('b--a', verdict({ interaction: pass, a11y: pass })),
      scenario('b--b', verdict({ interaction: pass, a11y: fail('x') })),
    ])
    const a11y = report.tallies.find((t) => t.key === 'a11y')
    expect(a11y).toMatchObject({ pass: 1, fail: 1, skip: 0 })
    expect(report.tallies.find((t) => t.key === 'interaction')).toMatchObject({ pass: 2, fail: 0 })
  })

  it('lists ONLY the failing checks on a failing scenario', () => {
    // A failure row that also names what passed buries the finding.
    const report = buildVerifyReport([
      scenario('b--a', verdict({ interaction: pass, leak: pass, a11y: fail('x') })),
    ])
    expect(report.failures[0]?.checks.map((c) => c.key)).toEqual(['a11y'])
  })

  it('orders failing checks by likelihood of being a real bug', () => {
    // interaction first: it subsumes mounting, and nothing downstream means
    // anything until the component runs at all.
    const report = buildVerifyReport([
      scenario('b--a', verdict({ a11y: fail('x'), ssrParity: fail('y'), interaction: fail('z') })),
    ])
    expect(report.failures[0]?.checks.map((c) => c.key)).toEqual([
      'interaction',
      'ssrParity',
      'a11y',
    ])
  })

  it('never renders an empty bullet for a check that failed without saying why', () => {
    const report = buildVerifyReport([scenario('b--a', verdict({ a11y: { status: 'fail' } }))])
    expect(report.failures[0]?.checks[0]?.findings).toEqual(['failed without reporting a reason'])
  })

  it('reports a skip reason only when every skip agreed on one', () => {
    // Summarising two different reasons as one would make a claim about
    // scenarios that never reached it.
    const one = buildVerifyReport([
      scenario('b--a', verdict({ leak: { status: 'skip', findings: ['no runtime'] } })),
      scenario('b--b', verdict({ leak: { status: 'skip', findings: ['no runtime'] } })),
    ])
    expect(one.tallies.find((t) => t.key === 'leak')?.skipReason).toBe('no runtime')

    const two = buildVerifyReport([
      scenario('b--a', verdict({ leak: { status: 'skip', findings: ['no runtime'] } })),
      scenario('b--b', verdict({ leak: { status: 'skip', findings: ['no wrapper'] } })),
    ])
    expect(two.tallies.find((t) => t.key === 'leak')?.skipReason).toBeUndefined()
  })

  it('reports EVERY check, so a new one can never be silently dropped', () => {
    // The drift guard. A seventh check added to the verdict but missing from
    // the report would fail invisibly — the summary would say everything is
    // green while a whole check went uncounted.
    const report = buildVerifyReport([scenario('b--a', verdict({ interaction: pass }))])
    expect(report.tallies.map((t) => t.key).sort()).toEqual([...CHECK_KEYS].sort())
  })
})

describe('formatCheckTally', () => {
  it('names the check and its ratio, so "which check?" needs no second command', () => {
    const report = buildVerifyReport([
      scenario('b--a', verdict({ interaction: pass, a11y: fail('x') })),
    ])
    expect(formatCheckTally(report.tallies)).toContain('a11y 0/1')
    expect(formatCheckTally(report.tallies)).toContain('interaction 1/1')
  })

  it('leads with the failing check rather than a fixed order', () => {
    const report = buildVerifyReport([
      scenario('b--a', verdict({ interaction: pass, leak: pass, a11y: fail('x') })),
    ])
    expect(formatCheckTally(report.tallies).startsWith('a11y')).toBe(true)
  })

  it('marks a failing check so it reads as a failure and not a low score', () => {
    const report = buildVerifyReport([scenario('b--a', verdict({ a11y: fail('x') }))])
    expect(formatCheckTally(report.tallies)).toContain('✗')
  })

  it('EXCLUDES checks that never ran — 0/0 reads as a failure', () => {
    const report = buildVerifyReport([scenario('b--a', verdict({ interaction: pass }))])
    const line = formatCheckTally(report.tallies)
    expect(line).toBe('interaction 1/1')
    expect(line).not.toContain('snapshot')
  })

  it('still PRINTS a check it has no display weight for', () => {
    // The other half of the drift guard. `buildVerifyReport` covers every key
    // in CHECK_KEYS; this covers a key the ORDERING table has not been taught
    // about — it sorts last instead of vanishing. A seventh check being merged
    // into verdicts and then dropped from the summary is the failure mode, and
    // "displayed in the wrong position" is a far cheaper one than "invisible".
    // Equal fail counts on purpose: the sort compares failures FIRST, so a
    // differing count would short-circuit before the weight lookup and the
    // spec would assert nothing about ordering an unknown key.
    const line = formatCheckTally([
      { key: 'brandNewCheck' as CheckKey, pass: 1, fail: 0, skip: 0 },
      { key: 'a11y', pass: 1, fail: 0, skip: 0 },
    ])
    expect(line).toContain('brandNewCheck 1/1')
    // Sorts LAST (weight 99) rather than vanishing.
    expect(line).toBe('a11y 1/1 · brandNewCheck 1/1')
  })

  it('leads with an unknown check when it is the one FAILING', () => {
    const line = formatCheckTally([
      { key: 'a11y', pass: 1, fail: 0, skip: 0 },
      { key: 'brandNewCheck' as CheckKey, pass: 0, fail: 1, skip: 0 },
    ])
    expect(line.startsWith('brandNewCheck 0/1 ✗')).toBe(true)
  })

  it('says so plainly when nothing ran at all', () => {
    expect(formatCheckTally(buildVerifyReport([scenario('b--a', emptyVerdict())]).tallies)).toBe(
      'no checks ran',
    )
  })

  it('is stable between runs on a healthy catalog, so it can be diffed', () => {
    const report = buildVerifyReport([
      scenario('b--a', verdict({ interaction: pass, a11y: pass, leak: pass })),
    ])
    expect(formatCheckTally(report.tallies)).toBe(formatCheckTally(report.tallies))
    expect(formatCheckTally(report.tallies)).toBe('interaction 1/1 · a11y 1/1 · leak 1/1')
  })
})

describe('formatNotRun', () => {
  it('groups checks that share a reason into one line', () => {
    const report = buildVerifyReport([scenario('b--a', verdict({ interaction: pass }))])
    const lines = formatNotRun(report.tallies)
    const browser = lines.find((l) => l.includes('reactivityCoverage'))
    expect(browser).toContain('snapshot')
    expect(browser).toContain('atlas verify-browser')
  })

  it('says nothing when every check ran', () => {
    const all = Object.fromEntries(CHECK_KEYS.map((k) => [k, pass])) as Record<CheckKey, VerifyCheck>
    expect(formatNotRun(buildVerifyReport([scenario('b--a', verdict(all))]).tallies)).toEqual([])
  })
})

describe('formatFailures', () => {
  it('names the scenario, the check, and the finding', () => {
    const report = buildVerifyReport([
      scenario('button--solid', verdict({ a11y: fail('no accessible name') })),
    ])
    expect(formatFailures(report.failures)).toEqual([
      '✗ button--solid',
      '    a11y: no accessible name',
    ])
  })

  it('prints every finding a check reported, not just the first', () => {
    const report = buildVerifyReport([scenario('b--a', verdict({ a11y: fail('one', 'two') }))])
    expect(formatFailures(report.failures)).toContain('    a11y: two')
  })

  it('REPORTS the cap when it truncates — a silent cut reads as a full list', () => {
    const report = buildVerifyReport(
      ['a', 'b', 'c'].map((id) => scenario(`b--${id}`, verdict({ a11y: fail('x') }))),
    )
    const lines = formatFailures(report.failures, 1)
    expect(lines.at(-1)).toContain('2 more failing scenario(s)')
    expect(lines.filter((l) => l.startsWith('✗'))).toHaveLength(1)
  })

  it('does not mention a cap it never hit', () => {
    const report = buildVerifyReport([scenario('b--a', verdict({ a11y: fail('x') }))])
    expect(formatFailures(report.failures, 5).join('\n')).not.toContain('more failing')
  })
})
