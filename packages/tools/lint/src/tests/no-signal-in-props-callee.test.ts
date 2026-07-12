/**
 * LT-5 regression: `no-signal-in-props` must resolve the callee to a
 * `signal()`/`computed()` binding — not flag ANY call to a bare identifier in
 * an uppercase-tag prop. Pre-fix, `String(v)`, `t(key)`, `humanize(id)`,
 * `buildColumnRegistry(...)` (none signals) were all flagged.
 */
import { noSignalInProps } from '../rules/reactivity/no-signal-in-props'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

const ON: LintConfig = { rules: { 'pyreon/no-signal-in-props': 'warn' } }
const R = 'pyreon/no-signal-in-props'

function ids(source: string): string[] {
  return lintFile('src/App.tsx', source, [noSignalInProps], ON).diagnostics.map((d) => d.ruleId)
}

describe('no-signal-in-props — callee must resolve to a signal (LT-5)', () => {
  it('FIRES when the callee is a signal binding', () => {
    expect(ids(`const s = signal(0); const A = () => <Comp value={s()} />`)).toContain(R)
  })
  it('FIRES when the callee is a computed binding', () => {
    expect(ids(`const c = computed(() => 1); const A = () => <Comp value={c()} />`)).toContain(R)
  })

  it('does NOT fire on String()/Number() (built-ins)', () => {
    expect(ids(`const A = () => <Comp value={String(v)} />`)).not.toContain(R)
    expect(ids(`const A = () => <Comp value={Number(v)} />`)).not.toContain(R)
  })
  it('does NOT fire on an i18n `t(key)` call', () => {
    expect(ids(`const A = () => <Comp label={t('key')} />`)).not.toContain(R)
  })
  it('does NOT fire on an imported pure helper `humanize(id)`', () => {
    expect(ids(`import { humanize } from './u'; const A = () => <Comp label={humanize(id)} />`)).not.toContain(
      R,
    )
  })
  it('resolves a signal declared AFTER the JSX too (deferred report)', () => {
    expect(ids(`const A = () => <Comp value={s()} />; const s = signal(0)`)).toContain(R)
  })
})
