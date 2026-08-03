/**
 * The component DECLARATION shapes the scanner recognises.
 *
 * Each of these was a silent miss: a component written this way simply was not
 * in the catalog, with no error and nothing to indicate an absence. That is the
 * worst failure mode a discovery tool has — "out of the box" is only true if
 * the box contains the way people actually write components.
 */
import { describe, expect, it } from 'vitest'
import { fileBaseName, scanSource } from '../scan'

const names = (code: string, file = 'component.tsx'): string[] =>
  scanSource(code, file).map((c) => c.name)

const controlsOf = (code: string): Record<string, string> => {
  const [component] = scanSource(code)
  const out: Record<string, string> = {}
  for (const control of component?.controls ?? []) out[control.name] = control.kind
  return out
}

describe('shapes that already worked', () => {
  it('export function', () => {
    expect(names('export function Button(props: { label: string }) { return null }')).toEqual([
      'Button',
    ])
  })

  it('export const arrow', () => {
    expect(names('export const Button = (props: { label: string }) => null')).toEqual(['Button'])
  })
})

describe('export default', () => {
  it('finds a NAMED default export', () => {
    expect(names('export default function Button(props: { label: string }) { return null }')).toEqual(
      ['Button'],
    )
  })

  it('names an ANONYMOUS default export after its file', () => {
    // What the import site will call it anyway.
    expect(
      names('export default function (props: { label: string }) { return null }', 'button-group.tsx'),
    ).toEqual(['ButtonGroup'])
  })

  it('does not emit a re-export twice', () => {
    // `export default Button` points at a declaration this walk already visits;
    // following it as well would list the component twice under one name.
    const code = 'export function Button(props: { label: string }) { return null }\nexport default Button\n'
    expect(names(code)).toEqual(['Button'])
  })
})

describe('typed-variable form', () => {
  it('reads props from a ComponentFn<Props> annotation', () => {
    // The props are in the TYPE ARGUMENT, not on the parameter — the
    // parameter-only reader returned `unknown` for every control here.
    const code = `
      interface Props { label: string; count: number }
      export const Button: ComponentFn<Props> = (props) => null
    `
    expect(names(code)).toEqual(['Button'])
    expect(controlsOf(code)).toEqual({ label: 'text', count: 'number' })
  })

  it('prefers the PARAMETER type when a component has both', () => {
    const code = `
      interface Outer { wrong: string }
      interface Inner { right: number }
      export const Button: ComponentFn<Outer> = (props: Inner) => null
    `
    expect(controlsOf(code)).toEqual({ right: 'number' })
  })
})

describe('wrapped components', () => {
  it('unwraps a single call wrapper', () => {
    const code = 'export const Button = nativeCompat((props: { label: string }) => null)'
    expect(names(code)).toEqual(['Button'])
    expect(controlsOf(code)).toEqual({ label: 'text' })
  })

  it('unwraps a nested wrapper', () => {
    const code = 'export const Button = nativeCompat(attrs((props: { label: string }) => null))'
    expect(controlsOf(code)).toEqual({ label: 'text' })
  })

  it('unwraps parenthesised and cast forms', () => {
    expect(names('export const Button = ((props: { a: string }) => null)')).toEqual(['Button'])
    expect(names('export const Button = ((props: { a: string }) => null) as never')).toEqual([
      'Button',
    ])
  })

  it('does not recurse without bound', () => {
    // Arbitrary source is the input; a pathological nest must not be able to
    // blow the scanner's stack.
    const deep = 'a('.repeat(50) + '(props: { x: string }) => null' + ')'.repeat(50)
    expect(() => scanSource(`export const Button = ${deep}`)).not.toThrow()
  })

  it('ignores a call with no function argument', () => {
    expect(names('export const Button = createThing({ a: 1 })')).toEqual([])
  })

  it('does NOT unwrap a rocketstyle chain — the regression this cost', () => {
    // A method call, not a wrapper. Unwrapping it finds the THEME CALLBACK and
    // reads `t` as props: the component is catalogued with fabricated props,
    // and because the static pass then claims the name, the rocketstyle pass
    // skips it and its real `.variants()` axes are never discovered.
    //
    // Measured on the workshop example when this was wrong: 43 scenarios
    // silently became 29. Nothing errored.
    const code = `
      export const Chip = chipBase
        .attrs({ tag: 'span' })
        .theme((t) => ({ color: t.text }))
        .variants((t) => ({ solid: { background: t.accent } }))
    `
    // Left entirely to the runtime rocketstyle pass, which can read the chain.
    expect(names(code)).toEqual([])
  })

  it('does not unwrap a member-call wrapper either — the safe side of the trade', () => {
    // A member-call wrapper is missed. A missed wrapper means a component absent from
    // the catalog; a mis-unwrapped chain means a component present with wrong
    // props AND a working discovery path suppressed. Absence is the cheaper
    // failure, and it is the one this picks.
    expect(names('export const Button = ns.wrap((props: { a: string }) => null)')).toEqual([])
  })
})

describe('what is still NOT found — stated, not pretended', () => {
  it('does not resolve an IMPORTED props type', () => {
    // Needs a type checker across files, which this deliberately is not. The
    // component IS found; its controls are just unknown.
    const code = `
      import type { Props } from './types'
      export function Button(props: Props) { return null }
    `
    expect(names(code)).toEqual(['Button'])
    expect(controlsOf(code)).toEqual({})
  })

  it('does not find a lowercase export', () => {
    // PascalCase is the component convention; without it every exported helper
    // would enter the catalog.
    expect(names('export function helper(props: { a: string }) { return null }')).toEqual([])
  })

  it('does not catalogue a `lazy()` boundary as a component', () => {
    // `lazy(() => import('./Heavy'))` passes a LOADER, not a component. Reading
    // that thunk as the component listed the boundary itself in the sidebar,
    // propless and with nothing useful to render. A zero-parameter function is
    // a component at the top level and a thunk as an argument.
    expect(names("export const Deferred = lazy(() => import('./Heavy'))")).toEqual([])
  })

  it('still finds a propless component declared directly', () => {
    // The other side of that rule: `const Logo = () => <svg/>` is a real,
    // perfectly ordinary component that happens to take no props.
    expect(names('export const Logo = () => null')).toEqual(['Logo'])
  })

  it('does not find a bare `styled()` component', () => {
    // `styled('div')` has no props written anywhere for a static reader to
    // find. Like a rocketstyle chain it needs the runtime pass — which today
    // only recognises rocketstyle, so these are absent. A real gap, named here
    // rather than left for someone to discover from an empty sidebar.
    expect(names("export const Box = styled('div')")).toEqual([])
  })
})

describe('fileBaseName', () => {
  it.each([
    ['button.tsx', 'Button'],
    ['button-group.tsx', 'ButtonGroup'],
    ['/a/b/date_picker.jsx', 'DatePicker'],
  ])('%s → %s', (file, expected) => {
    expect(fileBaseName(file)).toBe(expected)
  })
})
