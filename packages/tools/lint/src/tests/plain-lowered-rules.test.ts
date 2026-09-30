/**
 * Reactivity rules on PLAIN MODE files.
 *
 * Plain code has none of the classic syntax a reactivity rule matches, so each
 * rule that opts into `meta.plainLowered` also runs on the compiled form of a
 * plain file. Every such rule must prove both halves on PLAIN source — it fires
 * on the defect written the plain way, and stays quiet on the plain-correct
 * code — and the fixture map must be TOTAL over the opted-in rules, so a rule
 * cannot opt in without that proof.
 */
import { lintFile } from '../runner'
import { allRules } from '../rules'
import type { Rule } from '../types'

const P = `'use plain'\nimport { state, derived, effect } from '@pyreon/core/plain'\n`

const FIXTURES: Record<string, { bad: string; good: string; line: number }> = {
  'pyreon/no-signal-in-loop': {
    bad: `${P}export function C() {\n  for (let i = 0; i < 3; i++) {\n    let n = state(i)\n    log(n)\n  }\n  return null\n}`,
    good: `${P}export function C() {\n  let n = state(0)\n  for (let i = 0; i < 3; i++) log(n + i)\n  return null\n}`,
    line: 5,
  },
  'pyreon/no-nested-effect': {
    bad: `${P}let a = state(1)\neffect(() => {\n  effect(() => { log(a) })\n})`,
    good: `${P}let a = state(1)\neffect(() => { log(a) })`,
    line: 5,
  },
  'pyreon/no-unguarded-async-signal-write': {
    bad: `${P}let user = state.raw(null)\nexport async function load(id) {\n  const r = await fetch('/u/' + id)\n  user = await r.json()\n}`,
    good: `${P}let user = state.raw(null)\nlet seq = 0\nexport async function load(id) {\n  const mine = ++seq\n  const r = await fetch('/u/' + id)\n  const v = await r.json()\n  if (mine !== seq) return\n  user = v\n}`,
    line: 6,
  },
  'pyreon/no-unbatched-updates': {
    bad: `${P}let a = state(0)\nlet b = state(0)\nlet c = state(0)\nexport function reset() {\n  a = 0\n  b = 0\n  c = 0\n}`,
    good: `${P}import { batch } from '@pyreon/reactivity'\nlet a = state(0)\nlet b = state(0)\nlet c = state(0)\nexport function reset() {\n  batch(() => {\n    a = 0\n    b = 0\n    c = 0\n  })\n}`,
    line: 6,
  },
}

function run(rule: Rule, code: string) {
  return lintFile('src/plain.tsx', code, [rule], { rules: { [rule.meta.id]: 'error' } }).diagnostics
}

const opted = allRules.filter((r) => r.meta.plainLowered)

describe('reactivity rules protect Plain Mode files', () => {
  it('at least the core reactivity rules opt in', () => {
    expect(opted.length).toBeGreaterThanOrEqual(4)
  })

  it('the fixture map is TOTAL over every opted-in rule', () => {
    const missing = opted.map((r) => r.meta.id).filter((id) => !(id in FIXTURES))
    expect(missing, 'plainLowered rules without a plain fires/quiet proof').toEqual([])
  })

  for (const [id, fx] of Object.entries(FIXTURES)) {
    const rule = allRules.find((r) => r.meta.id === id)!
    it(`${id} — fires on the plain defect, at the right source line`, () => {
      expect(rule.meta.plainLowered, `${id} must opt into plainLowered`).toBe(true)
      const d = run(rule, fx.bad)
      // exactly one — a finding the source walk ALSO sees is never doubled
      expect(d.length).toBe(1)
      expect(d[0]!.loc.line).toBe(fx.line)
    })
    it(`${id} — quiet on the plain-correct code`, () => {
      expect(run(rule, fx.good)).toEqual([])
    })
  }

  it('a finding only the COMPILED form reveals is labelled and carries no autofix', () => {
    const rule = allRules.find((r) => r.meta.id === 'pyreon/no-unbatched-updates')!
    const d = run(rule, FIXTURES['pyreon/no-unbatched-updates']!.bad)
    expect(d[0]!.message).toContain("Plain Mode: found in this file's compiled form")
    expect(d[0]!.fix).toBeUndefined()
  })

  it('a CLASSIC file is unaffected (no double report, fixes kept)', () => {
    const rule = allRules.find((r) => r.meta.id === 'pyreon/no-nested-effect')!
    const d = run(rule, `import { effect } from '@pyreon/reactivity'\neffect(() => { effect(() => {}) })`)
    expect(d.length).toBe(1)
    expect(d[0]!.message).not.toContain('Plain Mode')
  })
})
