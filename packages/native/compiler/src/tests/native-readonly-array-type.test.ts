// `readonly T[]` / `ReadonlyArray<T>` are TS-only annotations — the runtime
// value is the same array, and both native targets already treat a Swift
// array as a value type / a Kotlin `List` as read-only. They must lower
// byte-identically to the mutable spelling: the crossing chart engine widened
// every palette parameter to `readonly string[]` and the generator THREW
// twelve "Unknown type annotation: TSTypeOperator" warnings — a whole class
// of ordinary code (`as const` palettes, `readonly` props) that was silently
// out of the subset.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const mutable = `import { signal } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
interface Theme { palette: string[]; labels: string[] }
function paletteAt(palette: string[], index: number): string {
  return palette.length === 0 ? '#000000' : palette[index % palette.length]!
}
export function C() {
  const names = signal<string[]>(['a', 'b'])
  const theme: Theme = { palette: ['#111111', '#222222'], labels: ['x'] }
  return <Text>{paletteAt(theme.palette, 1) + names()[0]}</Text>
}`

const readonlyArr = mutable
  .replace('interface Theme { palette: string[]; labels: string[] }', 'interface Theme { palette: readonly string[]; labels: ReadonlyArray<string> }')
  .replace('paletteAt(palette: string[], index: number)', 'paletteAt(palette: readonly string[], index: number)')
  .replace("signal<string[]>(['a', 'b'])", "signal<readonly string[]>(['a', 'b'])")

describe('readonly array annotations lower like the mutable spelling', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: readonly T[] and ReadonlyArray<T> emit byte-identically to T[] with zero warnings`, () => {
      const a = transform(mutable, { target })
      const b = transform(readonlyArr, { target })
      expect(a.warnings).toEqual([])
      expect(b.warnings).toEqual([])
      expect(b.code).toBe(a.code)
    })
  }
  it('a type operator the targets cannot express (keyof) still warns BY NAME', () => {
    const r = transform(
      `import { Text } from '@pyreon/primitives'
interface Row { a: number; b: number }
function pick(k: keyof Row): string { return k }
export function C() { return <Text>{pick('a')}</Text> }`,
      { target: 'swift' },
    )
    expect(r.warnings.join('\n')).toContain('keyof')
  })
})
