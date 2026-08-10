import {
  CHECK_KEYS,
  type CheckKey,
  type Scenario,
  type VerifyCheck,
  type VerifyVerdict,
} from '../../core/types'
import { emptyVerdict } from '../../plugins/registry'
import { diffVerdicts, formatDiff, summarizeDiff } from '../diff'

const pass: VerifyCheck = { status: 'pass' }
const fail: VerifyCheck = { status: 'fail', findings: [] }
const skip: VerifyCheck = { status: 'skip' }

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

describe('diffVerdicts', () => {
  it('reports nothing when nothing moved', () => {
    const before = [scenario('b--a', verdict({ a11y: pass }))]
    const after = [scenario('b--a', verdict({ a11y: pass }))]
    const diff = diffVerdicts(before, after)
    expect(diff).toMatchObject({ regressed: false, improved: false, changed: [] })
  })

  it('flags a check that started failing as a REGRESSION', () => {
    const diff = diffVerdicts(
      [scenario('b--a', verdict({ a11y: pass }))],
      [scenario('b--a', verdict({ a11y: fail }))],
    )
    expect(diff.regressed).toBe(true)
    expect(diff.changed[0]?.nowFailing).toEqual(['a11y'])
  })

  it('flags a check that stopped RUNNING as a regression too', () => {
    // The failure this exists to catch. Delete a wrapper and every
    // mount-dependent check drops to `skip`: the failures disappear, the counts
    // improve, and the catalog looks BETTER than it did. Losing coverage is the
    // one way to "fix" a red catalog that must never read as green.
    const diff = diffVerdicts(
      [scenario('b--a', verdict({ interaction: fail }))],
      [scenario('b--a', verdict({ interaction: skip }))],
    )
    expect(diff.regressed).toBe(true)
    expect(diff.changed[0]?.checksLost).toEqual(['interaction'])
    // And explicitly NOT counted as an improvement, even though the failure is
    // technically gone.
    expect(diff.improved).toBe(false)
  })

  it('flags a fixed check as an improvement', () => {
    const diff = diffVerdicts(
      [scenario('b--a', verdict({ a11y: fail }))],
      [scenario('b--a', verdict({ a11y: pass }))],
    )
    expect(diff).toMatchObject({ improved: true, regressed: false })
    expect(diff.changed[0]?.nowPassing).toEqual(['a11y'])
  })

  it('flags a newly-running check as an improvement', () => {
    // Installing `@pyreon/runtime-server` makes ssrParity run for the first
    // time. More coverage is a real win and should be reported as one.
    const diff = diffVerdicts(
      [scenario('b--a', verdict({ a11y: pass }))],
      [scenario('b--a', verdict({ a11y: pass, ssrParity: pass }))],
    )
    expect(diff.improved).toBe(true)
    expect(diff.changed[0]?.checksGained).toEqual(['ssrParity'])
  })

  it('can report a regression and an improvement in one run', () => {
    const diff = diffVerdicts(
      [scenario('b--a', verdict({ a11y: fail, leak: pass }))],
      [scenario('b--a', verdict({ a11y: pass, leak: fail }))],
    )
    expect(diff).toMatchObject({ regressed: true, improved: true })
  })

  it('does NOT call a new scenario a regression, however it verifies', () => {
    // A new component with a failing edge case is not a step backwards; it is
    // new information. Flagging it would make the ratchet fire on every added
    // component until people stopped believing it.
    const diff = diffVerdicts([], [scenario('b--a', verdict({ a11y: fail }))])
    expect(diff.regressed).toBe(false)
    expect(diff.added).toEqual(['b--a'])
    expect(diff.changed).toEqual([])
  })

  it('does NOT call a REMOVED scenario a regression', () => {
    // Deleting a component is a legitimate edit.
    const diff = diffVerdicts([scenario('b--a', verdict({ a11y: pass }))], [])
    expect(diff.regressed).toBe(false)
    expect(diff.removed).toEqual(['b--a'])
  })

  it('treats a MISSING verdict as all-skip on both sides', () => {
    // A scenario that never had a verdict, gaining one, is a gain — not a
    // crash and not a phantom regression.
    const diff = diffVerdicts([scenario('b--a')], [scenario('b--a', verdict({ a11y: pass }))])
    expect(diff.changed[0]?.checksGained).toEqual(['a11y'])
    expect(diff.regressed).toBe(false)
  })

  it('orders changed scenarios by id, so the output can be diffed', () => {
    const diff = diffVerdicts(
      [scenario('b--z', verdict({ a11y: pass })), scenario('b--a', verdict({ a11y: pass }))],
      [scenario('b--z', verdict({ a11y: fail })), scenario('b--a', verdict({ a11y: fail }))],
    )
    expect(diff.changed.map((d) => d.id)).toEqual(['b--a', 'b--z'])
  })

  it('compares EVERY check, so a new one is ratcheted the day it lands', () => {
    const before = [scenario('b--a', verdict({}))]
    const allPass = Object.fromEntries(CHECK_KEYS.map((k) => [k, pass])) as Record<
      CheckKey,
      VerifyCheck
    >
    const diff = diffVerdicts(before, [scenario('b--a', verdict(allPass))])
    expect([...(diff.changed[0]?.checksGained ?? [])].sort()).toEqual([...CHECK_KEYS].sort())
  })
})

describe('formatDiff', () => {
  it('leads with the regression, not the good news', () => {
    const diff = diffVerdicts(
      [scenario('b--a', verdict({ a11y: fail, leak: pass }))],
      [scenario('b--a', verdict({ a11y: pass, leak: fail }))],
    )
    expect(formatDiff(diff)[0]).toContain('now failing')
  })

  it('words a lost check as COVERAGE lost, not as a skip', () => {
    // The counts improve when this happens, so the wording has to carry the
    // bad news on its own.
    const diff = diffVerdicts(
      [scenario('b--a', verdict({ interaction: fail }))],
      [scenario('b--a', verdict({ interaction: skip }))],
    )
    expect(formatDiff(diff).join('\n')).toContain('the failure did not go away, the check did')
  })

  it('reports added and removed scenario counts', () => {
    const diff = diffVerdicts([scenario('b--old')], [scenario('b--new')])
    const text = formatDiff(diff).join('\n')
    expect(text).toContain('1 new scenario(s)')
    expect(text).toContain('1 scenario(s) no longer present')
  })
})

describe('summarizeDiff', () => {
  it('says REGRESSED and counts both kinds', () => {
    const diff = diffVerdicts(
      [scenario('b--a', verdict({ a11y: pass, interaction: pass }))],
      [scenario('b--a', verdict({ a11y: fail, interaction: skip }))],
    )
    const line = summarizeDiff(diff)
    expect(line).toContain('REGRESSED')
    expect(line).toContain('started failing')
    expect(line).toContain('stopped running')
  })

  it('says IMPROVED when only good things happened', () => {
    const diff = diffVerdicts(
      [scenario('b--a', verdict({ a11y: fail }))],
      [scenario('b--a', verdict({ a11y: pass }))],
    )
    expect(summarizeDiff(diff)).toContain('IMPROVED')
  })

  it('says so plainly when nothing moved', () => {
    const diff = diffVerdicts(
      [scenario('b--a', verdict({ a11y: pass }))],
      [scenario('b--a', verdict({ a11y: pass }))],
    )
    expect(summarizeDiff(diff)).toBe('no change in any check')
  })

  it('reports REGRESSED even when something also improved', () => {
    // A mixed run is a regression: the reader has to look, and leading with
    // the improvement would let a real break through on a green-looking line.
    const diff = diffVerdicts(
      [scenario('b--a', verdict({ a11y: fail, leak: pass }))],
      [scenario('b--a', verdict({ a11y: pass, leak: fail }))],
    )
    expect(summarizeDiff(diff)).toContain('REGRESSED')
  })
})
