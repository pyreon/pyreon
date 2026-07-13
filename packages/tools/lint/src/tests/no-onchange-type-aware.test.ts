/**
 * LR-5 regression: `no-onchange` (and its AUTOFIX) must only fire on TEXT-like
 * controls. On `<select>` and toggle/commit inputs (checkbox/radio/…),
 * `onChange` is the correct DOM event — rewriting it to `onInput` corrupts
 * correct code.
 */
import { noOnChange } from '../rules/jsx/no-onchange'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

const ON: LintConfig = { rules: { 'pyreon/no-onchange': 'warn' } }

function ids(source: string): string[] {
  return lintFile('src/App.tsx', source, [noOnChange], ON).diagnostics.map((d) => d.ruleId)
}
const R = 'pyreon/no-onchange'

describe('no-onchange — text-like only (LR-5)', () => {
  it('FIRES on a bare <input> (defaults to text)', () => {
    expect(ids(`const A = () => <input onChange={h} />`)).toContain(R)
  })
  it('FIRES on <input type="text"> and other text-like types', () => {
    expect(ids(`const A = () => <input type="text" onChange={h} />`)).toContain(R)
    expect(ids(`const A = () => <input type="email" onChange={h} />`)).toContain(R)
    expect(ids(`const A = () => <input type="number" onChange={h} />`)).toContain(R)
  })
  it('FIRES on <textarea>', () => {
    expect(ids(`const A = () => <textarea onChange={h} />`)).toContain(R)
  })

  it('does NOT fire on <select> (onChange is idiomatic)', () => {
    expect(ids(`const A = () => <select onChange={h} />`)).not.toContain(R)
  })
  it('does NOT fire on <input type="checkbox"> / radio / file / range / date', () => {
    for (const t of ['checkbox', 'radio', 'file', 'range', 'date', 'color']) {
      expect(ids(`const A = () => <input type="${t}" onChange={h} />`)).not.toContain(R)
    }
  })
  it('does NOT fire when the input type is DYNAMIC (can\'t prove text-like)', () => {
    expect(ids(`const A = () => <input type={t()} onChange={h} />`)).not.toContain(R)
  })
})
