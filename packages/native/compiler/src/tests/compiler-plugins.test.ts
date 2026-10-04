import {
  createCompiler,
  swiftBackend,
  transform,
  type CompilerModule,
  type CompilerPlugin,
} from '../index'
import { parsePyreon } from '../parse'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftWithStubs,
  validateSwiftTypecheck,
} from '../validate'
const APP = 'export function Example() { return <Text>hello</Text> }'
const BADGE = 'export function Example() { return <ReleaseBadge /> }'
const plugin = (extra: Partial<CompilerPlugin> = {}): CompilerPlugin => ({
  name: 'test',
  apiVersion: 1,
  ...extra,
})
const badge: CompilerPlugin<never> = {
  name: 'release-badge',
  apiVersion: 1,
  transformIR(module) {
    for (const component of module.components) {
      const expr = component.returnExpr
      if (expr.kind === 'jsx-element' && expr.tag === 'ReleaseBadge') {
        component.returnExpr = {
          kind: 'jsx-element',
          tag: 'Text',
          attrs: [],
          children: [{ kind: 'text', value: 'Ready for release' }],
        }
      }
    }
  },
}
describe('instance-owned compiler plugins', () => {
  it('preserves the default API and freezes built-in targets', () => {
    const compiler = createCompiler()
    expect(compiler.targets).toEqual(['swift', 'kotlin'])
    expect(Object.isFrozen(compiler.targets)).toBe(true)
    expect(Object.isFrozen(compiler)).toBe(true)
    for (const target of compiler.targets)
      expect(compiler.transform(APP, { target })).toEqual(transform(APP, { target }))
  })
  it.each(['swift', 'kotlin'] as const)('lowers a custom component into real %s code', (target) => {
    const output = createCompiler({ plugins: [badge] }).transform(BADGE, {
      target,
      filename: 'Example.tsx',
    })
    expect(output.code).toContain('Ready for release')
    expect(output.warnings).toEqual([])
    if (!(target === 'swift' ? isSwiftcAvailable() : isKotlincAvailable())) return
    const validate = target === 'swift' ? validateSwiftWithStubs : validateKotlin
    expect(
      validate(transform(BADGE, { target }).code).ok,
      'negative control without plugin must fail',
    ).toBe(false)
    const result = validate(output.code)
    expect(result.ok, result.error).toBe(true)
  })
  describe.skipIf(!isSwiftUIAvailable())('real Apple SDK', () => {
    it('compiles the extension', () => {
      const output = createCompiler({ plugins: [badge] }).transform(BADGE, { target: 'swift' })
      expect(validateSwiftTypecheck(transform(BADGE, { target: 'swift' }).code).ok).toBe(false)
      const verdict = validateSwiftTypecheck(output.code)
      expect(verdict.ok, verdict.error).toBe(true)
      expect(verdict.skipped).not.toBe(true)
    })
  })
  it('runs every source transform before runtime preparation', () => {
    const order: string[] = []
    const compiler = createCompiler({
      plugins: [
        plugin({
          name: 'first',
          prepareIR: () => {
            order.push('prepare-first')
          },
          transformIR: () => {
            order.push('transform-first')
          },
        }),
        plugin({
          name: 'second',
          transformIR(module) {
            order.push('transform-second')
            module.structs[0]!.name = 'UserSlice'
          },
          prepareIR: () => {
            order.push('prepare-second')
          },
        }),
      ],
    })
    const result = compiler.transform(
      "import '@pyreon/charts'; interface Slice { value: number }; " + APP,
      { target: 'swift' },
    )
    expect(order).toEqual([
      'transform-first',
      'transform-second',
      'prepare-first',
      'prepare-second',
    ])
    expect(result.warnings.some((w) => w.includes('SHADOWS'))).toBe(false)
  })
  it('registers an inferred custom target that delegates to Swift', () => {
    const compiler = createCompiler({
      plugins: [
        {
          name: 'preview',
          apiVersion: 1,
          backends: [
            {
              target: 'preview' as const,
              emit(module, context) {
                context.warn('preview backend')
                return swiftBackend.emit(module, context)
              },
            },
          ],
        },
      ],
    })
    expectTypeOf<Parameters<typeof compiler.transform>[1]['target']>().toEqualTypeOf<
      'swift' | 'kotlin' | 'preview'
    >()
    const result = compiler.transform(APP, { target: 'preview' })
    expect(result.code).toBe(transform(APP, { target: 'swift' }).code)
    expect(result.warnings).toEqual([
      '[Pyreon] plugin "preview" backend "preview": preview backend',
    ])
  })
  it('snapshots callback registrations and freezes context options', () => {
    const pass = vi.fn((_module, context) => {
      expect(Object.isFrozen(context.options)).toBe(true)
      expect(Object.isFrozen(context.options.fonts)).toBe(true)
      context.warn('original')
    })
    const mutable = { name: 'snapshot', apiVersion: 1 as const, transformIR: pass }
    const plugins = [mutable]
    const compiler = createCompiler({ plugins })
    plugins.length = 0
    mutable.transformIR = vi.fn()
    const options = { target: 'swift' as const, fonts: { Font: 'Font-Regular' } }
    expect(compiler.transform(APP, options).warnings).toEqual([
      '[Pyreon] plugin "snapshot": original',
    ])
    expect(options.fonts).toEqual({ Font: 'Font-Regular' })
    expect(pass).toHaveBeenCalledOnce()
  })
  it('isolates cached plugin IR from subsequent passes and compilers', () => {
    const shared = parsePyreon(APP)
    const compiler = createCompiler({
      plugins: [
        plugin({ transformIR: () => shared }),
        plugin({
          name: 'mutator',
          prepareIR(module) {
            module.components[0]!.name = 'Modified'
          },
        }),
      ],
    })
    const first = compiler.transform(APP, { target: 'swift' })
    expect(first.code).toContain('Modified')
    expect(shared.components[0]!.name).toBe('Example')
    compiler.transform(APP, { target: 'kotlin' })
    expect(compiler.transform(APP, { target: 'swift' })).toEqual(first)
    expect(createCompiler().transform(APP, { target: 'swift' })).toEqual(
      transform(APP, { target: 'swift' }),
    )
  })
  it('isolates runtime chart declarations from custom passes', () => {
    const source = "import '@pyreon/charts'; " + APP
    const baseline = transform(source, { target: 'swift' })
    createCompiler({
      plugins: [
        plugin({
          prepareIR(module) {
            for (const struct of module.structs) struct.name = 'Changed'
          },
        }),
      ],
    }).transform(source, { target: 'swift' })
    expect(transform(source, { target: 'swift' })).toEqual(baseline)
  })
  it('does not retain warnings across calls', () => {
    const compiler = createCompiler({
      plugins: [
        plugin({
          transformIR(_module, context) {
            if (context.source.includes('hello')) context.warn('hello')
          },
        }),
      ],
    })
    expect(compiler.transform(APP, { target: 'swift' }).warnings).toEqual([
      '[Pyreon] plugin "test": hello',
    ])
    expect(compiler.transform(APP.replace('hello', 'bye'), { target: 'swift' }).warnings).toEqual(
      [],
    )
  })
  it('restores the module namespace after backend exceptions', () => {
    const compiler = createCompiler({
      plugins: [
        plugin({
          backends: [
            {
              target: 'broken',
              emit() {
                throw new Error('backend fault')
              },
            },
          ],
        }),
      ],
    })
    const objects =
      'export function Example() { const rows = Array.from({ length: 3 }, (_, i) => ({ id: i, label: `Row ${i}` })); return <For each={rows} by={(r) => r.id}>{(r) => <Text>{r.label}</Text>}</For> }'
    const baseline = transform(objects, { target: 'swift' })
    expect(baseline.code).toMatch(/struct __Obj\d+: Codable/)
    expect(() => compiler.transform(objects, { target: 'broken', filename: 'Broken.tsx' })).toThrow(
      /plugin "test" backend "broken" failed in emit: backend fault/,
    )
    expect(transform(objects, { target: 'swift' })).toEqual(baseline)
  })
  it('permits nested compilation in a source pass', () => {
    const compiler = createCompiler({
      plugins: [
        plugin({
          transformIR() {
            transform(APP, { target: 'kotlin', filename: 'Inner.tsx' })
          },
        }),
      ],
    })
    expect(compiler.transform(APP, { target: 'swift', filename: 'Outer.tsx' })).toEqual(
      transform(APP, { target: 'swift', filename: 'Outer.tsx' }),
    )
  })
  it.each([
    [{ plugins: {} }, /plugins must be an array/],
    [{ plugins: [null] }, /nonempty name/],
    [{ plugins: [plugin({ name: '' })] }, /nonempty name/],
    [{ plugins: [plugin(), plugin()] }, /Duplicate native compiler plugin/],
    [{ plugins: [plugin({ name: '@pyreon/charts' })] }, /Duplicate native compiler plugin/],
    [{ plugins: [{ ...plugin(), apiVersion: 2 }] }, /supports API 1/],
    [{ plugins: [plugin({ transformIR: 1 as never })] }, /transformIR must be/],
    [{ plugins: [plugin({ prepareIR: 1 as never })] }, /prepareIR must be/],
    [{ plugins: [plugin({ backends: {} as never })] }, /backends must be an array/],
    [{ plugins: [plugin({ backends: [null as never] })] }, /nonempty target/],
    [
      {
        plugins: [plugin({ backends: [{ target: '', emit: () => ({ code: '', warnings: [] }) }] })],
      },
      /nonempty target/,
    ],
    [
      {
        plugins: [
          plugin({ backends: [{ target: 'swift', emit: () => ({ code: '', warnings: [] }) }] }),
        ],
      },
      /Duplicate native compiler target/,
    ],
  ])('rejects invalid registration %#', (config, error) => {
    expect(() => createCompiler(config as never)).toThrow(error)
  })
  it.each([
    plugin({ transformIR: () => ({}) as CompilerModule }),
    plugin({ transformIR: () => ({ ...parsePyreon(APP), aliasImports: {} }) as never }),
    plugin({ transformIR: () => ({ ...parsePyreon(APP), warnings: [1] }) as never }),
    plugin({ transformIR: () => ({ ...parsePyreon(APP), imports: [1] }) as never }),
    plugin({ transformIR: () => Promise.reject(new Error('async rejection')) as never }),
    plugin({ prepareIR: () => Promise.resolve() as never }),
    plugin({
      transformIR: () => {
        throw new Error('pass fault')
      },
    }),
    plugin({
      transformIR(_module, context) {
        context.warn(1 as never)
      },
    }),
  ])('attributes malformed/asynchronous pass failures %#', (extension) => {
    expect(() =>
      createCompiler({ plugins: [extension] }).transform(APP, { target: 'swift' }),
    ).toThrow(/plugin "test" failed in (transformIR|prepareIR)/)
  })
  it.each([
    () => null,
    () => ({ code: 1, warnings: [] }),
    () => ({ code: '', warnings: [1] }),
    () => ({ code: '', warnings: null }),
    () => Promise.reject(new Error('async backend')),
  ])('rejects malformed/asynchronous backend results %#', (emit) => {
    const compiler = createCompiler({
      plugins: [plugin({ backends: [{ target: 'bad', emit: emit as never }] })],
    })
    expect(() => compiler.transform(APP, { target: 'bad' })).toThrow(/backend "bad" failed in emit/)
  })
})
