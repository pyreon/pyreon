/**
 * Declaration shapes the static scan meets in real source, and what it does
 * with each.
 *
 * The bar throughout is the same one the scanner sets for itself: an honest
 * `unknown` beats a confident wrong answer, and a shape it cannot read must
 * still yield the COMPONENT — a found component with no controls is an
 * incomplete catalog, a dropped one is an invisible one.
 */
import { describe, expect, it } from 'vitest'
import { fileBaseName, scanSource } from '../scan'
import { pascalExports } from '../unmatched'

const one = (code: string, file = '/p/Button.tsx') => scanSource(code, file)[0]
const kinds = (code: string, file = '/p/Button.tsx'): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const control of one(code, file)?.controls ?? []) out[control.name] = control.kind
  return out
}

describe('body defaults — the literal forms', () => {
  it('reads `true` and `false` off a `??` fallback', () => {
    const code =
      'interface P { on?: boolean; off?: boolean }\nexport function Button(props: P) { const on = props.on ?? true; const off = props.off ?? false; return null }'
    const controls = one(code)?.controls ?? []
    expect(controls.find((c) => c.name === 'on')?.defaultValue).toBe(true)
    expect(controls.find((c) => c.name === 'off')?.defaultValue).toBe(false)
  })

  it('reads a template literal with no substitutions, and refuses one WITH them', () => {
    const code =
      'interface P { a?: string; b?: string }\nexport function Button(props: P) { const a = props.a ?? `plain`; const b = props.b ?? `${1}`; return null }'
    const controls = one(code)?.controls ?? []
    expect(controls.find((c) => c.name === 'a')?.defaultValue).toBe('plain')
    // Not a knowable default: the value depends on evaluation.
    expect(controls.find((c) => c.name === 'b')?.defaultValue).toBeUndefined()
  })

  it('refuses a non-minus prefix operator — `+1` is not the literal the author wrote', () => {
    const code = 'interface P { n?: number }\nexport function Button(props: P) { const n = props.n ?? +1; return null }'
    expect(one(code)?.controls[0]?.defaultValue).toBeUndefined()
  })

  it('refuses a minus applied to something that is not a numeric literal', () => {
    const code =
      'interface P { n?: number }\nexport function Button(props: P) { const n = props.n ?? -other; return null }'
    expect(one(code)?.controls[0]?.defaultValue).toBeUndefined()
  })

  it('survives a declaration with NO body — an overload signature', () => {
    // `export function Button(props: P)` with no braces is a real statement in a
    // `.d.ts` and in an overload set; walking a missing body would throw.
    const code = 'interface P { label: string }\nexport declare function Button(props: P): unknown'
    expect(() => scanSource(code, '/p/Button.tsx')).not.toThrow()
    expect(kinds(code)).toEqual({ label: 'text' })
  })
})

describe('the props type on the parameter', () => {
  it('is `unknown`-free when the annotation is a shape the scan cannot follow', () => {
    // An indexed access is a legitimate annotation and NOT a type reference, so
    // there is nothing to look up — the component is still found.
    const code = 'interface All { button: { label: string } }\nexport function Button(props: All["button"]) { return null }'
    expect(one(code)?.name).toBe('Button')
    expect(one(code)?.controls).toEqual([])
  })

  it('yields the component with no controls when the parameter is untyped', () => {
    expect(one('export function Button(props) { return null }')?.controls).toEqual([])
  })

  it('reads an inline type literal on the parameter', () => {
    expect(kinds('export function Button(props: { label: string }) { return null }')).toEqual({
      label: 'text',
    })
  })
})

describe('the `FC<Props>`-style annotation', () => {
  it('reads an INLINE type argument', () => {
    const code = 'type FC<P> = (props: P) => unknown\nexport const Button: FC<{ label: string }> = (props) => null'
    expect(kinds(code)).toEqual({ label: 'text' })
  })

  it('reads a NAMED type argument', () => {
    const code =
      'interface P { label: string }\ntype FC<T> = (props: T) => unknown\nexport const Button: FC<P> = (props) => null'
    expect(kinds(code)).toEqual({ label: 'text' })
  })

  it('yields the component with no controls when the annotation has NO type argument', () => {
    const code = 'type FC = (props: unknown) => unknown\nexport const Button: FC = (props) => null'
    expect(one(code)?.name).toBe('Button')
    expect(one(code)?.controls).toEqual([])
  })

  it('yields the component when the annotation is not a type reference at all', () => {
    const code = 'export const Button: (props: unknown) => unknown = (props) => null'
    expect(one(code)?.name).toBe('Button')
  })

  it('yields the component when the type argument is neither a literal nor a reference', () => {
    const code = 'type FC<P> = (props: P) => unknown\nexport const Button: FC<string[]> = (props) => null'
    expect(one(code)?.controls).toEqual([])
  })
})

describe('the union reader', () => {
  it('gives up on the whole union when ANY member is not a string literal', () => {
    // Half a union is a variant axis missing values, which generates scenarios
    // the component never actually has.
    const code = 'interface P { size?: "sm" | 1 }\nexport function Button(props: P) { return null }'
    expect(one(code)?.axes).toEqual([])
    expect(kinds(code)).toEqual({ size: 'unknown' })
  })

  it('keeps a union of string literals as an axis', () => {
    const code = 'interface P { size?: "sm" | "lg" }\nexport function Button(props: P) { return null }'
    expect(one(code)?.axes).toEqual([{ name: 'size', values: ['sm', 'lg'] }])
  })
})

describe('naming', () => {
  it('names an anonymous `export default function()` after its file', () => {
    expect(one('export default function(props: { a: string }) { return null }', '/p/button-group.tsx')?.name).toBe(
      'ButtonGroup',
    )
  })

  it('leaves a non-default anonymous function alone — there is no name to take', () => {
    expect(scanSource('export function(props) { return null }', '/p/x.tsx')).toEqual([])
  })

  it('title-cases a file name across every separator', () => {
    expect(fileBaseName('/p/button-group.tsx')).toBe('ButtonGroup')
    expect(fileBaseName('/p/icon_button.ts')).toBe('IconButton')
    expect(fileBaseName('/p/nav.bar.jsx')).toBe('NavBar')
    expect(fileBaseName('card')).toBe('Card')
  })
})

describe('bindings that declare a name and nothing else', () => {
  it('yields no component for an exported PascalCase binding with no initializer', () => {
    // `export let Button` names something the scan cannot read a contract from;
    // the unmatched report is where that is surfaced, not the catalog.
    expect(scanSource('export let Button;', '/p/Button.tsx')).toEqual([])
  })

  it('yields no component for an exported non-function value', () => {
    expect(scanSource('export const Button = 42;', '/p/Button.tsx')).toEqual([])
  })
})

describe('pascalExports — what an unmatched file offered', () => {
  it('reports a `const` with NO initializer, with no invented reason', () => {
    // `export let Button` declares the name and nothing a reader could diagnose.
    const found = pascalExports('export let Button;', '/p/x.ts')
    expect(found).toEqual([{ name: 'Button' }])
  })

  it('names a plain call expression as un-inlinable props', () => {
    const found = pascalExports('export const Button = make();', '/p/x.ts')
    expect(found[0]?.reason).toContain('not written anywhere this scan can read them')
  })

  it('skips a lowercase name in a re-export while keeping the PascalCase ones', () => {
    const found = pascalExports("export { helper, Button } from './b'", '/p/x.ts')
    expect(found.map((f) => f.name)).toEqual(['Button'])
  })

  it('ignores an `export *` — it names nothing to look for', () => {
    expect(pascalExports("export * from './b'", '/p/x.ts')).toEqual([])
  })
})
