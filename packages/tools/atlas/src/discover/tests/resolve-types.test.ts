/**
 * Resolving a props type that lives in another file.
 *
 * The gap this closes: `import type { ButtonProps } from './types'` is what
 * most real design systems do, and it produced ZERO controls — the component
 * was found, its whole contract was not. No knobs, no variant axes, no
 * scenarios past the edge cases, and an agent guide that could not say what the
 * component accepts.
 *
 * Deliberately not a type checker. The bounds are as much the contract as the
 * resolution: a barrel cycle must not hang a scan, and a type from
 * `node_modules` must resolve to an honest `unknown` rather than a confident
 * guess.
 */
import { describe, expect, it } from 'vitest'
import { createTypeResolver, resolveSpecifier } from '../resolve-types'
import { scanSource } from '../scan'

/** A fake disk. Keys are absolute-ish paths; the resolver is injected onto it. */
const disk = (files: Record<string, string>) => {
  const readSource = (file: string): string => {
    const source = files[file]
    if (source === undefined) throw new Error(`ENOENT ${file}`)
    return source
  }
  const resolveFile = (specifier: string, fromFile: string): string | undefined => {
    if (!specifier.startsWith('.')) return undefined
    const dir = fromFile.slice(0, fromFile.lastIndexOf('/'))
    const base = `${dir}/${specifier.replace(/^\.\//, '')}`.replace(/\/\.\//g, '/')
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
      if (files[candidate] !== undefined) return candidate
    }
    return undefined
  }
  return { readSource, resolveFile }
}

const controlsOf = (
  code: string,
  file: string,
  files: Record<string, string>,
): Record<string, string> => {
  const resolveImportedType = createTypeResolver(disk(files))
  const [component] = scanSource(code, file, { resolveImportedType })
  const out: Record<string, string> = {}
  for (const control of component?.controls ?? []) out[control.name] = control.kind
  return out
}

describe('the gap this closes', () => {
  it('resolves a props type imported from a sibling file', () => {
    const files = {
      '/p/types.ts': 'export interface Props { label: string; count: number }',
    }
    const code = "import type { Props } from './types'\nexport function Button(props: Props) {}"
    expect(controlsOf(code, '/p/Button.tsx', files)).toEqual({ label: 'text', count: 'number' })
  })

  it('an imported `extends` props type inherits the base declared beside it', () => {
    const files = {
      '/p/types.ts':
        "interface Base { label: string }\nexport interface Props extends Base { count: number }",
    }
    const code = "import type { Props } from './types'\nexport function Button(props: Props) {}"
    expect(controlsOf(code, '/p/Button.tsx', files)).toEqual({ label: 'text', count: 'number' })
  })

  it('an imported intersection alias is resolved and followed', () => {
    const files = {
      '/p/types.ts': "type Base = { label: string }\nexport type Props = Base & { count: number }",
    }
    const code = "import type { Props } from './types'\nexport function Button(props: Props) {}"
    expect(controlsOf(code, '/p/Button.tsx', files)).toEqual({ label: 'text', count: 'number' })
  })

  it('reads a union through the import, so the VARIANT AXIS survives', () => {
    // The axis is what produces scenarios. Without it a component imported this
    // way had only edge-case scenarios, however many variants it declared.
    const files = { '/p/types.ts': "export interface Props { state?: 'a' | 'b' }" }
    const code = "import type { Props } from './types'\nexport function Button(props: Props) {}"
    const resolveImportedType = createTypeResolver(disk(files))
    const [component] = scanSource(code, '/p/Button.tsx', { resolveImportedType })
    expect(component?.axes).toEqual([{ name: 'state', values: ['a', 'b'] }])
  })

  it('follows a BARREL re-export', () => {
    // `types/index.ts` re-exporting from `types/button.ts` is the norm in a
    // design system, so stopping at the barrel would close almost nothing.
    const files = {
      '/p/types/index.ts': "export type { Props } from './button'",
      '/p/types/button.ts': 'export interface Props { label: string }',
    }
    const code = "import type { Props } from './types'\nexport function Button(props: Props) {}"
    expect(controlsOf(code, '/p/Button.tsx', files)).toEqual({ label: 'text' })
  })

  it('follows `export *`', () => {
    const files = {
      '/p/types/index.ts': "export * from './button'",
      '/p/types/button.ts': 'export interface Props { label: string }',
    }
    const code = "import type { Props } from './types'\nexport function Button(props: Props) {}"
    expect(controlsOf(code, '/p/Button.tsx', files)).toEqual({ label: 'text' })
  })

  it('honours an ALIASED import', () => {
    // The other file declares `Props`; looking for `ButtonProps` there finds
    // nothing.
    const files = { '/p/types.ts': 'export interface Props { label: string }' }
    const code =
      "import type { Props as ButtonProps } from './types'\nexport function Button(props: ButtonProps) {}"
    expect(controlsOf(code, '/p/Button.tsx', files)).toEqual({ label: 'text' })
  })

  it('resolves a type alias, not only an interface', () => {
    const files = { '/p/types.ts': 'export type Props = { label: string }' }
    const code = "import type { Props } from './types'\nexport function Button(props: Props) {}"
    expect(controlsOf(code, '/p/Button.tsx', files)).toEqual({ label: 'text' })
  })

  it('prefers a SAME-FILE type over an imported one of the same name', () => {
    // A local declaration shadows an import in TypeScript, and disagreeing with
    // the language would produce a contract the compiler does not believe.
    const files = { '/p/types.ts': 'export interface Props { imported: string }' }
    const code =
      "import type { Props } from './types'\ninterface Props { local: number }\nexport function Button(props: Props) {}"
    expect(controlsOf(code, '/p/Button.tsx', files)).toEqual({ local: 'number' })
  })
})

describe('bounds — the part that keeps a scan finishing', () => {
  it('does not hang on a re-export CYCLE', () => {
    const files = {
      '/p/a.ts': "export type { Props } from './b'",
      '/p/b.ts': "export type { Props } from './a'",
    }
    const code = "import type { Props } from './a'\nexport function Button(props: Props) {}"
    expect(() => controlsOf(code, '/p/Button.tsx', files)).not.toThrow()
    expect(controlsOf(code, '/p/Button.tsx', files)).toEqual({})
  })

  it('gives up past a bounded depth rather than walking forever', () => {
    const files: Record<string, string> = {}
    for (let i = 0; i < 20; i += 1) files[`/p/t${i}.ts`] = `export type { Props } from './t${i + 1}'`
    files['/p/t20.ts'] = 'export interface Props { label: string }'
    const code = "import type { Props } from './t0'\nexport function Button(props: Props) {}"
    // Not found — and, crucially, it RETURNS.
    expect(controlsOf(code, '/p/Button.tsx', files)).toEqual({})
  })

  it('returns unknown for an unreadable file rather than crashing the scan', () => {
    const code = "import type { Props } from './missing'\nexport function Button(props: Props) {}"
    expect(controlsOf(code, '/p/Button.tsx', {})).toEqual({})
  })
})

describe('what it deliberately does NOT resolve', () => {
  it('a BARE specifier — resolving into node_modules needs the real algorithm', () => {
    // A confident wrong answer is worse than the honest `unknown` this keeps.
    expect(resolveSpecifier('@acme/ui', '/p/Button.tsx')).toBeUndefined()
    expect(resolveSpecifier('react', '/p/Button.tsx')).toBeUndefined()
  })

  it('is a NO-OP when no resolver is supplied', () => {
    // `scanSource` stays pure and its old behaviour is exactly preserved.
    const code = "import type { Props } from './types'\nexport function Button(props: Props) {}"
    const [component] = scanSource(code, '/p/Button.tsx')
    expect(component?.name).toBe('Button')
    expect(component?.controls).toEqual([])
  })
})

describe('inherited props — `interface Props extends Base`', () => {
  // `ComboboxProps extends ComboboxBaseProps` reported ONE prop (`children`,
  // a render prop — not a control), so Combobox showed an empty Controls
  // panel while its headless base declares the whole contract.
  it('reads a SAME-FILE base', () => {
    const code =
      'interface Base { label: string; disabled?: boolean }\n' +
      'interface Props extends Base { size?: number }\n' +
      'export function Button(props: Props) {}'
    expect(controlsOf(code, '/p/Button.tsx', {})).toEqual({ size: 'number', label: 'text', disabled: 'boolean' })
  })

  it('reads an IMPORTED base, and the base of THAT base from its own file', () => {
    const files = {
      '/p/base.ts':
        "import type { Root } from './root'\nexport interface Base extends Root { options: string; multiple?: boolean }",
      '/p/root.ts': 'export interface Root { placeholder?: string }',
    }
    const code =
      "import type { Base } from './base'\n" +
      'interface ComboProps extends Base { children?: (s: unknown) => unknown }\n' +
      'export function Combo(props: ComboProps) {}'
    expect(controlsOf(code, '/p/Combo.tsx', files)).toEqual({
      children: 'reactive',
      options: 'text',
      multiple: 'boolean',
      placeholder: 'text',
    })
  })

  it('reads a base declared beside the IMPORTED base, and skips index signatures', () => {
    const files = {
      '/p/base.ts':
        'interface Root { placeholder?: string; [key: string]: unknown }\n' +
        'export interface Base extends Root { options: string; [key: string]: unknown }',
    }
    const code =
      "import type { Base } from './base'\n" +
      'interface Props extends Base { own: number }\n' +
      'export function Combo(props: Props) {}'
    expect(controlsOf(code, '/p/Combo.tsx', files)).toEqual({
      own: 'number',
      options: 'text',
      placeholder: 'text',
    })
  })

  it('lets the OWN member win over an inherited one of the same name (TS narrowing)', () => {
    const code =
      "interface Base { size?: string }\ninterface Props extends Base { size?: 'sm' | 'lg' }\n" +
      'export function Button(props: Props) {}'
    expect(controlsOf(code, '/p/Button.tsx', {})).toEqual({ size: 'select' })
  })

  it('does not evaluate `Omit<…>` (it would re-add what the component removed), nor chase an unknown base', () => {
    const code =
      "interface Base { a: string; b: string }\ninterface Props extends Omit<Base, 'b'>, Missing { c: string }\n" +
      'export function Button(props: Props) {}'
    expect(controlsOf(code, '/p/Button.tsx', {})).toEqual({ c: 'text' })
  })

  it('survives a heritage cycle', () => {
    const code =
      'interface A extends B { a: string }\ninterface B extends A { b: string }\n' +
      'export function Button(props: A) {}'
    expect(controlsOf(code, '/p/Button.tsx', {})).toEqual({ a: 'text', b: 'text' })
  })

  it('an imported base that is not resolvable (no resolver) contributes nothing', () => {
    const code =
      "import type { Base } from './base'\ninterface Props extends Base { own: string }\n" +
      'export function Button(props: Props) {}'
    const [component] = scanSource(code, '/p/Button.tsx')
    expect(component?.controls.map((c) => c.name)).toEqual(['own'])
  })

  it('an imported base whose OWN base is not resolvable stops there', () => {
    const files = { '/p/base.ts': "import type { Far } from '@scope/far'\nexport interface Base extends Far { x: string }" }
    const code =
      "import type { Base } from './base'\ninterface Props extends Base { own: string }\n" +
      'export function Button(props: Props) {}'
    expect(controlsOf(code, '/p/Button.tsx', files)).toEqual({ own: 'text', x: 'text' })
  })
})
