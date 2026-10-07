import { describe, expect, it } from 'vitest'
import { createCompiler } from '../index'
import * as pluginApi from '../plugin-api'
import { assertPluginShape } from '../plugin-shape'
import { createScopeRegistry } from '../scope-provider'
import { kotlinAugmentation, swiftAugmentation } from '../stub-augmentation'
import { chartsCompiler, chartsPlugin, chartsStubs } from './charts-plugin'

// The `@pyreon/charts` plugin lives in `@pyreon/charts`; these specs lock the seams that let it
// live there: the compiler alone knows nothing about charts, the plugin-author entry is the
// whole contract, and the scope / stub extensions behave as the plugin relies on.

const PIE = `import { PieChart } from '@pyreon/charts'
import { Stack } from '@pyreon/primitives'
const ROWS = [{ n: 'a', v: 1 }]
export function A() { return (<Stack><PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} height={120} /></Stack>) }`

describe('the compiler carries no chart knowledge of its own', () => {
  it('lowers a chart host only when the plugin is loaded', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const alone = createCompiler().transform(PIE, { target })
      expect(alone.code, `${target} without the plugin`).not.toContain('PyreonChartCanvas')
      expect(chartsCompiler.transform(PIE, { target }).code, `${target} with the plugin`).toContain('PyreonChartCanvas')
    }
  })

  it('opens no colour scope without a provider, and the plugin supplies all three', () => {
    expect(createCompiler().registries.scopes.entries).toEqual([])
    const tags = chartsCompiler.registries.scopes.entries.flatMap((e) => e.provider.tags).sort()
    expect(tags).toEqual(['ChartThemeProvider', 'ColorModeProvider', 'PyreonUI', 'PyreonUIProvider'])
  })
})

describe('@pyreon/native-compiler/plugin-api', () => {
  it('exports the version, the walker and the pure spelling helpers a plugin uses', () => {
    expect(Object.keys(pluginApi).sort()).toEqual([
      'NATIVE_COMPILER_PLUGIN_API_VERSION',
      'forEachExpr',
      'isNumericLiteralOrNegation',
      'kotlinIdent',
      'kotlinStr',
      'substituteIdentifier',
      'swiftIdent',
      'swiftStr',
    ])
    expect(pluginApi.NATIVE_COMPILER_PLUGIN_API_VERSION).toBe(chartsPlugin.apiVersion)
  })
})

describe('CompilerPlugin.scopes', () => {
  const provider = (tags: string[]) => ({ module: '@acme/ui', tags, enter: () => ({}) })

  it('a (module, tag) pair has one owner, named in the error', () => {
    expect(() =>
      createScopeRegistry([
        { name: '@acme/a', scopes: [provider(['Theme'])] },
        { name: '@acme/b', scopes: [provider(['Theme'])] },
      ]),
    ).toThrow(/<Theme> from @acme\/ui is claimed by both "@acme\/a" and "@acme\/b"/)
  })

  it('the same tag from another module is a different claim', () => {
    const registry = createScopeRegistry([
      { name: '@acme/a', scopes: [provider(['Theme'])] },
      { name: '@acme/b', scopes: [{ ...provider(['Theme']), module: '@other/ui' }] },
    ])
    expect(registry.find('Theme', (_t, m) => m === '@other/ui')?.module).toBe('@other/ui')
    expect(registry.find('Theme', () => false)).toBeUndefined()
    expect(registry.hasTag('Theme')).toBe(true)
  })

  it.each([
    [{ scopes: {} }, /scopes must be an array/],
    [{ scopes: [{ module: '@a', tags: [], enter() {} }] }, /colour-scope provider needs/],
    [{ scopes: [{ module: '@a', tags: ['T'] }] }, /colour-scope provider needs/],
    [{ scopes: [{ module: '@a', tags: ['T'], enter() {}, transparent: 'yes' }] }, /colour-scope provider needs/],
    [{ stubs: { swift: 'no' } }, /stubs must be an object with swift and\/or kotlin functions/],
  ])('shape validation rejects a malformed field %#', (extra, message) => {
    expect(() => assertPluginShape({ name: '@acme/bad', apiVersion: 1, ...extra })).toThrow(message)
  })
})

describe('CompilerPlugin.stubs / ValidateOptions.augment', () => {
  const CANVAS = 'PyreonChartCanvas(cmds: x)'

  it('appends the chart stubs (and the real engine) only for an input that names a chart canvas', () => {
    const swift = swiftAugmentation({ augment: [chartsStubs] }, CANVAS)
    expect(swift).toContain('public struct PyreonChartCanvas')
    expect(swift).toContain('func layoutSankey')
    const kotlin = kotlinAugmentation({ augment: [chartsStubs] }, CANVAS)
    expect(kotlin).toContain('fun PyreonChartCanvas')
    expect(kotlin).toContain('fun layoutSankey')
    expect(swiftAugmentation({ augment: [chartsStubs] }, 'struct A {}')).toBe('')
    expect(kotlinAugmentation({ augment: [chartsStubs] }, 'class A')).toBe('')
  })

  it('adds nothing without options, and composes several augmentations in order', () => {
    expect(swiftAugmentation(undefined, CANVAS)).toBe('')
    expect(kotlinAugmentation({}, CANVAS)).toBe('')
    const both = swiftAugmentation({ augment: [{ swift: () => 'A\n' }, { kotlin: () => 'ignored' }, { swift: () => 'B\n' }] }, 'x')
    expect(both).toBe('A\nB\n')
  })
})
