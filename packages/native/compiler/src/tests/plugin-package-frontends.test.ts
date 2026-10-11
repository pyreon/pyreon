import { describe, expect, it } from 'vitest'
import { createCompiler } from '../compiler'
import type { CompilerPlugin } from '../plugin'
import { topLevelDeclarators } from '../plugin-ast'
import attrsPlugin from '../../../../ui-system/attrs/src/native-plugin'
import stylerPlugin from '../../../../ui-system/styler/src/native-plugin'
import rocketstylePlugin from '../../../../ui-system/rocketstyle/src/native-plugin'
import reactivityPlugin from '../../../../core/reactivity/src/native-plugin'
import kineticPlugin from '../../../../ui-system/kinetic/src/native-plugin'
import kineticPresetsPlugin from '../../../../ui-system/kinetic-presets/src/native-plugin'

const targets = ['swift', 'kotlin'] as const

// An unrelated package proves the file-item JSX hook carries ordinary IR rather
// than a back door that only the first-party styling packages can use.
const factoryPlugin: CompilerPlugin = {
  name: 'factory',
  apiVersion: 2,
  topLevel(node) {
    const decl = topLevelDeclarators(node)[0] as
      | { id?: { name?: string }; init?: { callee?: { name?: string } } }
      | undefined
    if (decl?.init?.callee?.name !== 'box' || !decl.id?.name) return
    return { type: 'box', name: decl.id.name }
  },
  items: {
    box: {
      swift: () => [],
      kotlin: () => [],
      element: (_item, element) => ({ ...element, tag: 'Text' }),
    },
  },
}

describe.each(targets)('package frontend seams (%s)', (target) => {
  it('rewrites a local factory tag through generic JSX, independent of declaration order', () => {
    const compiler = createCompiler({ plugins: [factoryPlugin] })
    const source = 'function App() { return <Box>owned</Box> }; const Box = box()'
    const result = compiler.transform(source, { target })
    expect(result.code).toContain('owned')
    expect(result.code).not.toMatch(/\bBox[ ({]/)
    expect(result.code).not.toContain('box(')
    expect(createCompiler().transform(source, { target }).code).toMatch(/\bBox[ ({]/)
  })

  it('does not retain a factory binding across files or compiler instances', () => {
    const compiler = createCompiler({ plugins: [factoryPlugin] })
    compiler.transform('const Box = box(); function App() { return <Box>first</Box> }', { target })
    const source = 'function App() { return <Box>second</Box> }'
    expect(compiler.transform(source, { target })).toEqual(
      createCompiler().transform(source, { target }),
    )
  })

  it('binds a package vocabulary to generic signal and computed operations', () => {
    const plugin: CompilerPlugin = {
      name: 'cells',
      apiVersion: 2,
      modules: ['@acme/cells'],
      intrinsicCalls: { makeCell: 'signal', derive: 'computed' },
    }
    const source = `import { makeCell as state, derive } from '@acme/cells'
      function App() { const n = state(2); const doubled = derive(() => n() * 2); return <Text>{doubled()}</Text> }`
    const result = createCompiler({ plugins: [plugin] }).transform(source, { target })
    expect(result.warnings).toEqual([])
    expect(result.code).toContain(
      target === 'swift' ? '@State private var n: Int = 2' : 'mutableStateOf(2L)',
    )
    expect(result.code).not.toMatch(/\b(?:state|makeCell|derive)\(/)
  })

  it('requires the package owner for imported state while preserving unimported core operations', () => {
    const body = 'function App() { const value = signal(2); return <Text>{value()}</Text> }'
    const imported = `import { signal } from '@pyreon/reactivity'; ${body}`
    const state = target === 'swift' ? '@State' : 'mutableStateOf'
    expect(createCompiler().transform(body, { target }).code).toContain(state)
    expect(createCompiler().transform(imported, { target }).code).not.toContain(state)
    expect(
      createCompiler({ plugins: [reactivityPlugin] }).transform(imported, { target }).code,
    ).toContain(state)
    expect(
      createCompiler().transform(imported.replace('@pyreon/reactivity', './foreign'), { target })
        .code,
    ).not.toContain(state)
  })

  it('retains foreign imports instead of claiming their similarly named functions', () => {
    const source = `import { signal } from './foreign'
      function App() { const value = signal(2); return <Text>{value}</Text> }`
    const result = createCompiler({ plugins: [reactivityPlugin] }).transform(source, { target })
    expect(result.code).not.toContain(target === 'swift' ? '@State' : 'mutableStateOf')
  })

  it('resolves imported constants before consumers scan, in either plugin order', () => {
    const values: CompilerPlugin = {
      name: 'tones',
      apiVersion: 2,
      modules: ['@acme/tones'],
      constants: (name) => (name === 'dark' ? 'violet' : undefined),
    }
    const consumer: CompilerPlugin = {
      name: 'paint',
      apiVersion: 2,
      modules: ['@acme/paint'],
      scanModule(scan) {
        const tone = scan.constant({ type: 'Identifier', name: 'night' })
        const missing = scan.constant({ type: 'Identifier', name: 'missing' })
        expect(tone).toEqual({ module: '@acme/tones', name: 'dark', value: 'violet' })
        expect(missing).toEqual({ module: '@acme/tones', name: 'unknown', value: undefined })
        const state = scan.fileState('paint', () => ({ color: '' }))
        state.color = tone?.value ?? ''
      },
      decls: {},
      calls: {
        usePaint: (_call, ctx) => ({
          signal: {
            initial: {
              type: 'Literal',
              value: ctx.fileState('paint', () => ({ color: '' })).color,
            },
          },
        }),
      },
    }
    const source = `import { dark as night, unknown as missing } from '@acme/tones'
      import { usePaint } from '@acme/paint'
      function App() { const color = usePaint(); return <Text>{color()}</Text> }`
    const first = createCompiler({ plugins: [consumer, values] }).transform(source, { target })
    expect(first.code).toContain('violet')
    expect(createCompiler({ plugins: [values, consumer] }).transform(source, { target })).toEqual(
      first,
    )
  })

  it.each([
    ['attrs', attrsPlugin, "attrs({ name: 'Box', component: Stack }).attrs({ padding: 4 })"],
    ['styler', stylerPlugin, 'styled(Stack)`padding: 16px;`'],
    [
      'rocketstyle',
      rocketstylePlugin,
      "rocketstyle()({ name: 'Box', component: Stack }).theme(() => ({ padding: 16 }))",
    ],
  ] as const)(
    '%s owns its factory without loading any other library plugin',
    (_name, plugin, factory) => {
      const source = `const Box = ${factory}; function App() { return <Box>owned</Box> }`
      const owned = createCompiler({ plugins: [plugin] }).transform(source, { target })
      expect(owned.code).toContain(target === 'swift' ? 'VStack' : 'Column(')
      expect(owned.code).not.toMatch(/\bBox[ ({]/)
      expect(createCompiler().transform(source, { target }).code).toMatch(/\bBox[ ({]/)
    },
  )

  it.each([
    ['attrs', attrsPlugin, "alias({ name: 'Box', component: Stack }).attrs({ padding: 4 })"],
    ['styler', stylerPlugin, 'alias(Stack)`padding: 16px;`'],
    [
      'rocketstyle',
      rocketstylePlugin,
      "alias()({ name: 'Box', component: Stack }).theme(() => ({ padding: 16 }))",
    ],
  ] as const)(
    '%s follows default import aliases and refuses foreign factory bindings',
    (name, plugin, factory) => {
      const source = `import alias from '@pyreon/${name}'; const Box = ${factory}; function App() { return <Box>alias</Box> }`
      const compiler = createCompiler({ plugins: [plugin] })
      expect(compiler.transform(source, { target }).code).not.toMatch(/\bBox[ ({]/)
      expect(
        compiler.transform(source.replace(`@pyreon/${name}`, './foreign'), { target }).code,
      ).toMatch(/\bBox[ ({]/)
    },
  )

  it('activates the kinetic preset vocabulary independently from the kinetic factory', () => {
    const source = `import { kinetic } from '@pyreon/kinetic'; import { fadeUp as enter } from '@pyreon/kinetic-presets'
      const Box = kinetic('div').preset(enter); function App() { return <Box>animate</Box> }`
    const compiler = createCompiler({ plugins: [kineticPlugin, kineticPresetsPlugin] })
    expect(compiler.transform(source, { target }).code).toContain('__kineticIn')
    expect(
      createCompiler({ plugins: [kineticPlugin] }).transform(source, { target }).code,
    ).not.toContain('__kineticIn')
  })
})

it('rejects malformed or duplicate frontend capabilities before compilation', () => {
  const invalid = (extension: object) =>
    createCompiler({
      plugins: [{ name: 'invalid', apiVersion: 2, ...extension } as CompilerPlugin],
    })
  expect(() => invalid({ intrinsicCalls: { make: 'unrecognized' } })).toThrow('intrinsicCalls')
  expect(() => invalid({ constants: () => 'red' })).toThrow('nonempty modules')
  expect(() =>
    invalid({
      intrinsicCalls: { signal: 'signal' },
      calls: { signal: () => undefined },
      decls: {},
    }),
  ).toThrow('both an intrinsic and a declaration call')
  expect(() =>
    createCompiler({
      plugins: [
        {
          name: 'invalid-constant',
          apiVersion: 2,
          modules: ['@acme/constants'],
          constants: (() => 4) as unknown as (name: string) => string,
          scanModule() {},
        },
      ],
    }).transform("import { value } from '@acme/constants'; function App() { return <Text /> }", {
      target: 'swift',
    }),
  ).toThrow('must resolve to a string or undefined')
  expect(() =>
    invalid({ items: { x: { swift: () => [], kotlin: () => [], element: 4 } } }),
  ).toThrow('element must be')
  expect(() =>
    createCompiler({
      plugins: [
        { name: 'first', apiVersion: 2, modules: ['@acme/one'], constants: () => 'a' },
        { name: 'second', apiVersion: 2, modules: ['@acme/one'], constants: () => 'b' },
      ],
    }),
  ).toThrow('more than one owner')
})
