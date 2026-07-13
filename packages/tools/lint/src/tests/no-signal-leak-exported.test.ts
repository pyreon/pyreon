/**
 * LT-7 regression: `no-signal-leak` must not flag EXPORTED module-level signals
 * as "unused". They are consumed by other modules (the canonical shared-store /
 * `defineStore` signal shape); a per-file walker can't see those usages.
 */
import { noSignalLeak } from '../rules/reactivity/no-signal-leak'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

const ON: LintConfig = { rules: { 'pyreon/no-signal-leak': 'warn' } }

function ids(source: string): string[] {
  return lintFile('src/store.ts', source, [noSignalLeak], ON).diagnostics.map((d) => d.ruleId)
}

describe('no-signal-leak — exported signals are not "leaks"', () => {
  it('does NOT flag `export const x = signal(0)` (consumed cross-module)', () => {
    expect(ids('import { signal } from "@pyreon/reactivity"\nexport const count = signal(0)')).not.toContain(
      'pyreon/no-signal-leak',
    )
  })

  it('does NOT flag a signal exported via a specifier `export { s }`', () => {
    expect(
      ids('import { signal } from "@pyreon/reactivity"\nconst s = signal(0)\nexport { s }'),
    ).not.toContain('pyreon/no-signal-leak')
  })

  it('does NOT flag a renamed export `export { s as store }`', () => {
    expect(
      ids('import { signal } from "@pyreon/reactivity"\nconst s = signal(0)\nexport { s as store }'),
    ).not.toContain('pyreon/no-signal-leak')
  })

  it('STILL flags a genuinely unused NON-exported signal', () => {
    expect(ids('import { signal } from "@pyreon/reactivity"\nconst dead = signal(0)')).toContain(
      'pyreon/no-signal-leak',
    )
  })
})
