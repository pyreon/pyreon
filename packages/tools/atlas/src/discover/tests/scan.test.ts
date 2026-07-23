import type { ComponentIntelligence } from '../../core'
import { scanSource } from '../scan'

const byName = (comp: ComponentIntelligence) => Object.fromEntries(comp.controls.map((c) => [c.name, c]))

describe('scanSource', () => {
  it('extracts an exported function component with an inline props type', () => {
    const comps = scanSource(`export function Button(props: { label: string; disabled?: boolean }) { return null }`)
    expect(comps).toHaveLength(1)
    const names = byName(comps[0]!)
    expect(comps[0]!.name).toBe('Button')
    expect(names.label).toMatchObject({ kind: 'text', required: true })
    expect(names.disabled).toMatchObject({ kind: 'boolean', required: false })
  })

  it('resolves a same-file interface and derives axes from string-literal unions', () => {
    const comps = scanSource(`
      interface Props { label: string; variant: 'solid' | 'ghost' }
      export const Badge = (props: Props) => null
    `)
    expect(comps[0]!.name).toBe('Badge')
    expect(comps[0]!.axes).toContainEqual({ name: 'variant', values: ['solid', 'ghost'] })
    expect(byName(comps[0]!).variant).toMatchObject({ kind: 'select', options: ['solid', 'ghost'] })
  })

  it('resolves a same-file object type alias, incl. number + accessor props', () => {
    const comps = scanSource(`
      type P = { n: number; onChange: () => void }
      export function Field(props: P) { return null }
    `)
    const names = byName(comps[0]!)
    expect(names.n!.kind).toBe('number')
    expect(names.onChange).toMatchObject({ kind: 'reactive', reactive: true })
  })

  it('extracts a function-expression component', () => {
    const comps = scanSource(`export const Card = function (props: { title: string }) { return null }`)
    expect(comps[0]!.name).toBe('Card')
  })

  it('handles a component with no props', () => {
    const comps = scanSource(`export function Spinner() { return null }`)
    expect(comps[0]!.name).toBe('Spinner')
    expect(comps[0]!.controls).toEqual([])
  })

  it('marks unsupported / non-string-literal-union / untyped props as unknown', () => {
    const comps = scanSource(`export function X(props: { data: object; mix: 'a' | 3; bare }) { return null }`)
    const names = byName(comps[0]!)
    expect(names.data!.kind).toBe('unknown')
    expect(names.mix!.kind).toBe('unknown')
    expect(names.bare!.kind).toBe('unknown')
  })

  it('skips index signatures and method members', () => {
    const comps = scanSource(`export function Y(props: { label: string; onClick(): void; [k: string]: unknown }) { return null }`)
    expect(comps[0]!.controls.map((c) => c.name)).toEqual(['label'])
  })

  it('yields no props for an imported (unresolvable) props type', () => {
    const comps = scanSource(`export function Z(props: ImportedProps) { return null }`)
    expect(comps[0]!.name).toBe('Z')
    expect(comps[0]!.controls).toEqual([])
  })

  it('skips non-exported, non-PascalCase, and non-function declarations', () => {
    const comps = scanSource(`
      function helper(props: { x: string }) { return null }
      export function lowercase(props: { x: string }) { return null }
      const Local = (props: { x: string }) => null
      export const NOT_A_FN = 42
      export const alsoLower = () => null
    `)
    expect(comps).toEqual([])
  })

  it('records the source file name', () => {
    const comps = scanSource(`export function A(props: { x: string }) { return null }`, 'src/A.tsx')
    expect(comps[0]!.source).toBe('src/A.tsx')
  })
})
