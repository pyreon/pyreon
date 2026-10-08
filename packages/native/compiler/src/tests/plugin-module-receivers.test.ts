import { describe, expect, it } from 'vitest'
import { createCompiler } from '../compiler'
import type { CompilerPlugin } from '../plugin'
import { createPluginScope } from '../plugin-scope'
import type { ModuleReceiverSite } from '../module-items'
import type { ExtModuleItem } from '../types'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

function makePlugin(): CompilerPlugin {
  const read = ({ expr, receiver }: ModuleReceiverSite): string | undefined => {
    const member = expr.kind === 'call' && expr.args.length === 0 ? expr.callee : expr
    if (member.kind !== 'member' || member.property !== 'value') return undefined
    return `Native_${receiver.name}.value`
  }
  return {
    name: '@acme/module-receiver', apiVersion: 1, modules: ['@acme/module-receiver'],
    topLevel(node) {
      const n = node as { declarations?: { id?: { name?: string }; init?: { callee?: { name?: string } } }[] }
      const decl = n.declarations?.[0]
      if (decl?.init?.callee?.name !== 'defineUnit' || decl.id?.name === undefined) return undefined
      return { type: 'unit', name: decl.id.name }
    },
    items: {
      unit: {
        swift: (item) => [`enum Native_${item.name} { static let value = 7.5 }`],
        kotlin: (item) => [`object Native_${item.name} { val value = 7.5 }`],
        receivers: { swift: read, kotlin: read },
        typing: {
          type: (item, expr) => expr.kind === 'call' || expr.kind === 'member'
            ? read({ expr, receiver: item }) === undefined ? undefined : { kind: 'number', float: true }
            : undefined,
        },
      },
    },
  }
}

const HEAD = `import { defineUnit } from '@acme/module-receiver'
import { Text } from '@pyreon/primitives'
const Units = defineUnit()
`

describe('module item receivers', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`lowers instance and callable roots on ${target}`, () => {
      const compiler = createCompiler({ discovered: [makePlugin()] })
      const result = compiler.transform(`${HEAD}
        export function App() { return <Text>{Units.value() + Units().value}</Text> }`, { target })
      expect(result.code.match(/Native_Units\.value/g)).toHaveLength(2)
      expect(result.code).not.toContain('Native_Units.value()')
    })

    it(`declines unknown members on ${target}`, () => {
      const compiler = createCompiler({ discovered: [makePlugin()] })
      const result = compiler.transform(`${HEAD}
        export function App() { return <Text>{Units.label}</Text> }`, { target })
      expect(result.code).toContain('Units.label')
      expect(result.code).not.toContain('Native_Units.value')
    })

    it(`respects function parameter shadowing on ${target}`, () => {
      const compiler = createCompiler({ discovered: [makePlugin()] })
      const result = compiler.transform(`${HEAD}
        function read(Units: { value: number }): number { return Units.value }
        export function App() { return <Text>{Units.value()}</Text> }`, { target })
      expect(result.code.match(/Native_Units\.value/g)).toHaveLength(1)
      expect(result.code).toContain('Units.value')
    })

    it(`types derived values from the module item's owner on ${target}`, () => {
      const compiler = createCompiler({ discovered: [makePlugin()] })
      const result = compiler.transform(`${HEAD}
        import { computed } from '@pyreon/reactivity'
        export function App() {
          const scaled = computed(() => Units.value() * 2)
          return <Text>{scaled()}</Text>
        }`, { target })
      expect(result.code).not.toContain('scaled: Any')
      expect(result.code).toContain('Native_Units.value')
      if (target === 'swift') expect(result.code).toContain('scaled: Double')
      else expect(result.code).toContain('pyreonNumberString(scaled)')
    })

    it(`does not carry receivers into a subsequent file on ${target}`, () => {
      const compiler = createCompiler({ discovered: [makePlugin()] })
      compiler.transform(`${HEAD} export function App() { return <Text>{Units.value()}</Text> }`, { target })
      const second = compiler.transform(`import { Text } from '@pyreon/primitives'
        export function Next() { return <Text>{Units.value()}</Text> }`, { target })
      expect(second.code).not.toContain('Native_Units')
    })

    it(`respects a component props parameter without hiding the item in another component on ${target}`, () => {
      const compiler = createCompiler({ discovered: [makePlugin()] })
      const result = compiler.transform(`${HEAD}
        export function Local(Units: { value: number }) { return <Text>{Units.value}</Text> }
        export function Global() { return <Text>{Units.value()}</Text> }`, { target })
      expect(result.code.match(/Native_Units\.value/g)).toHaveLength(1)
    })
  }

  it('component declarations shadow an item without affecting other scopes', () => {
    const item: ExtModuleItem = { plugin: '@acme/module-receiver', type: 'unit', name: 'Units', payload: {} }
    const first = createPluginScope([{ kind: 'signal', name: 'Units', type: { kind: 'number' }, initial: { kind: 'literal', value: 0 } }], [item])
    const second = createPluginScope([], [item])
    expect(first.itemByName('Units')).toBeUndefined()
    expect(second.itemByName('Units')).toBe(item)
  })

  it('rejects an invalid receiver extension before compiling source', () => {
    const plugin = makePlugin()
    const unit = plugin.items!.unit!
    expect(() => createCompiler({ discovered: [{ ...plugin, items: { unit: { ...unit, receivers: { swift: 42 } } } } as unknown as CompilerPlugin] }))
      .toThrow(/module-receiver.*items\.unit\.receivers/)
  })

  it.skipIf(!isSwiftcAvailable())('the emitted module receiver and derived value typecheck with swiftc', () => {
    const compiler = createCompiler({ discovered: [makePlugin()] })
    const result = compiler.transform(`${HEAD}
      import { computed } from '@pyreon/reactivity'
      export function App() { const scaled = computed(() => Units.value() * 2); return <Text>{scaled()}</Text> }`, { target: 'swift' })
    const validation = validateSwiftWithStubs(result.code)
    expect(validation.ok, validation.error).toBe(true)
    expect(validation.skipped).not.toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the emitted module receiver and derived value typecheck with kotlinc', () => {
    const compiler = createCompiler({ discovered: [makePlugin()] })
    const result = compiler.transform(`${HEAD}
      import { computed } from '@pyreon/reactivity'
      export function App() { const scaled = computed(() => Units.value() * 2); return <Text>{scaled()}</Text> }`, { target: 'kotlin' })
    const validation = validateKotlin(result.code)
    expect(validation.ok, validation.error).toBe(true)
    expect(validation.skipped).not.toBe(true)
  })
})
