import { describe, expect, it } from 'vitest'
import { transform, validateKotlin } from './first-party-plugins'
const bodies = [
  '(v: number) => value.set(v)',
  '(v: number) => { if (v > 0) return value.set(v); value.set(1) }',
  '(v: number) => v + 1',
  '(v: number) => { if (v > 0) return; value.set(v) }',
]
describe.each(['useDebouncedCallback', 'useThrottledCallback'])('%s callback returns', hook => {
  it.each(bodies)('compiles %s as a labelled Unit callback', body => {
    const r = transform(`import { signal } from '@pyreon/reactivity'; import { ${hook} } from '@pyreon/hooks'; export function App() { const value = signal(0); const action = ${hook}(${body}, 20); return <Button onPress={() => action(1)}>{String(value())}</Button> }`, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    const verdict = validateKotlin(r.code)
    expect(verdict.ok, verdict.error).toBe(true)
    expect(r.code).toContain('__pyreonRateAction@')
    expect(r.code).toContain('return@__pyreonRateAction')
  })
})
