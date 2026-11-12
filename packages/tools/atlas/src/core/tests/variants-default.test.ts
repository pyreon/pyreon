/**
 * The derived `Default` scenario renders the component's OWN default (#4365).
 * It used to pin every axis to the union's first member, so a `Button` with
 * `size?: 'sm' | 'md' | 'lg'` rendering `props.size ?? 'md'` got `size: "sm"`.
 *
 * Bisect-verified: with the old `values[0]` defaults the scan-to-scenario spec
 * reads `{ size: 'sm' }` and the unit specs see the first values.
 */
import { describe, expect, it } from 'vitest'
import { scanSource } from '../../discover/scan'
import { autoVariantScenarios, defaultCombination } from '../variants'

const scenarioArgs = (code: string) => {
  const [c] = scanSource(code, '/p/Button.tsx')
  return autoVariantScenarios('Button', c!.axes).map((s) => [s.name, s.args])
}

describe('the Default scenario', () => {
  it('uses the default the component reads (`props.size ?? "md"`), from source', () => {
    const code = `interface P { size?: 'sm' | 'md' | 'lg' }
export function Button(props: P) { return <button data-size={props.size ?? 'md'} /> }`
    expect(scenarioArgs(code)).toEqual([
      ['Default', { size: 'md' }],
      ['size=sm', { size: 'sm' }],
      ['size=lg', { size: 'lg' }],
    ])
  })

  it('leaves an optional axis with no readable default to the component', () => {
    const code = `interface P { tone?: 'a' | 'b' }
export function Badge(props: P) { return <span class={props.tone} /> }`
    expect(scenarioArgs(code)).toEqual([
      ['Default', {}],
      ['tone=a', { tone: 'a' }],
      ['tone=b', { tone: 'b' }],
    ])
  })

  it('pins a required axis to its first value (it must be given)', () => {
    expect(defaultCombination([{ name: 'kind', values: ['x', 'y'] }])).toEqual({ kind: 'x' })
  })

  it('ignores a declared default that is not one of the values', () => {
    expect(defaultCombination([{ name: 's', values: ['a', 'b'], default: 'zz', optional: true }])).toEqual({})
  })

  it('full matrix: the default combination comes first, once', () => {
    const axes = [
      { name: 'size', values: ['sm', 'md'], default: 'md', optional: true },
      { name: 'tone', values: ['a', 'b'], optional: true },
    ]
    const names = autoVariantScenarios('B', axes, {}, 'full').map((s) => s.name)
    expect(names[0]).toBe('Default')
    expect(names.filter((n) => n === 'Default')).toHaveLength(1)
    expect(names).toHaveLength(5)
  })
})
