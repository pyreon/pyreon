import { BUILT_IN_PLUGINS, createCompiler, type CompilerPlugin } from '../index'
import {
  BUILT_IN_SERVICE_OWNER,
  createServiceRegistry,
  orderPlugins,
  selectDiscovered,
  serviceSpecsOf,
} from '../service-registry'
import { SERVICES } from '../services'

const spec = { swift: 'PyreonThing()', kotlin: ['val {id} = remember { PyreonThing() }'] }
const plugin = (name: string, extra: Partial<CompilerPlugin> = {}): CompilerPlugin => ({
  name,
  apiVersion: 1,
  ...extra,
})

describe('createServiceRegistry', () => {
  it('holds every built-in service under the compiler owner', () => {
    const registry = createServiceRegistry(BUILT_IN_PLUGINS)
    expect([...registry.keys()]).toEqual(SERVICES.map((s) => s.hook))
    expect(registry.get('useShare')?.owner).toBe(BUILT_IN_SERVICE_OWNER)
  })

  it('adds a plugin service with its owner and the hook key filled in', () => {
    const registry = createServiceRegistry([...BUILT_IN_PLUGINS, plugin('@acme/thing', { services: { useThing: spec } })])
    expect(registry.get('useThing')).toEqual({
      descriptor: { hook: 'useThing', legacyKind: 'service', ...spec },
      owner: '@acme/thing',
    })
  })

  it('lets a plugin service state its own legacyKind, and defaults to the generic one', () => {
    const registry = createServiceRegistry([
      plugin('@acme/thing', { services: { useThing: { ...spec, legacyKind: 'thing' }, useOther: spec } }),
    ])
    expect(registry.get('useThing')?.descriptor.legacyKind).toBe('thing')
    expect(registry.get('useOther')?.descriptor.legacyKind).toBe('service')
  })

  it('refuses two owners for one hook and tells the app to pick one', () => {
    expect(() =>
      createServiceRegistry([
        plugin('A', { services: { useThing: spec } }),
        plugin('B', { services: { useThing: spec } }),
      ]),
    ).toThrow(/hook "useThing" is claimed by both "A" and "B"/)
  })

  it('refuses a plugin claiming a built-in hook', () => {
    expect(() => createServiceRegistry([...BUILT_IN_PLUGINS, plugin('A', { services: { useShare: spec } })])).toThrow(
      /hook "useShare" is claimed by both "@pyreon\/hooks" and "A"/,
    )
  })

  it('round-trips descriptors through serviceSpecsOf', () => {
    const registry = createServiceRegistry([plugin('P', { services: serviceSpecsOf(SERVICES) })])
    expect([...registry.values()].map((r) => r.descriptor)).toEqual([...SERVICES])
  })
})

describe('orderPlugins', () => {
  it('keeps input order when nothing is required', () => {
    const list = [plugin('c'), plugin('a'), plugin('b')]
    expect(orderPlugins(list).map((p) => p.name)).toEqual(['c', 'a', 'b'])
  })

  it('puts a requirement first, deterministically', () => {
    const list = [plugin('late', { requires: ['early'] }), plugin('x'), plugin('early')]
    const once = orderPlugins(list).map((p) => p.name)
    expect(once).toEqual(['x', 'early', 'late'])
    expect(orderPlugins(list).map((p) => p.name)).toEqual(once)
  })

  it('names the plugin and the missing requirement', () => {
    expect(() => orderPlugins([plugin('a', { requires: ['ghost'] })])).toThrow(
      /Plugin "a" requires plugin "ghost", which is not loaded/,
    )
  })

  it('reports a cycle naming the plugins in it', () => {
    expect(() =>
      orderPlugins([plugin('a', { requires: ['b'] }), plugin('b', { requires: ['a'] })]),
    ).toThrow(/requires cycle: "a", "b"/)
  })
})

describe('selectDiscovered', () => {
  const builtIn = [{ name: '@pyreon/charts', builtIn: true }, { name: 'sticky' }]

  it('lets a discovered plugin replace a builtIn one by name, silently', () => {
    const found = plugin('@pyreon/charts')
    expect(selectDiscovered(builtIn, [], [found])).toEqual({
      kept: [found],
      replaced: ['@pyreon/charts'],
    })
  })

  it('does not replace a built-in that is not marked builtIn', () => {
    const found = plugin('sticky')
    expect(selectDiscovered(builtIn, [], [found])).toEqual({ kept: [found], replaced: [] })
  })

  it('prefers an explicit plugin over a discovered one of the same name', () => {
    expect(selectDiscovered(builtIn, [{ name: 'p' }], [plugin('p')])).toEqual({
      kept: [],
      replaced: [],
    })
  })

  it('rejects the same plugin discovered twice', () => {
    expect(() => selectDiscovered(builtIn, [], [plugin('p'), plugin('p')])).toThrow(/discovered twice/)
  })
})

describe('createCompiler wiring', () => {
  it('exposes the registry and throws a conflict at load time', () => {
    const ok = createCompiler({ plugins: [plugin('A', { services: { useThing: spec } })] })
    expect(ok.services.get('useThing')?.owner).toBe('A')
    expect(() =>
      createCompiler({
        plugins: [
          plugin('A', { services: { useThing: spec } }),
          plugin('B', { services: { useThing: spec } }),
        ],
      }),
    ).toThrow(/claimed by both "A" and "B"/)
  })

  it('throws a missing requirement at load time, not at transform time', () => {
    expect(() => createCompiler({ plugins: [plugin('A', { requires: ['nope'] })] })).toThrow(
      /requires plugin "nope"/,
    )
  })

  it('runs passes in requires order and lets a plugin require a built-in by name', () => {
    const order: string[] = []
    const compiler = createCompiler({
      plugins: [
        plugin('second', { requires: ['first'], transformIR: () => void order.push('second') }),
        plugin('first', { requires: ['@pyreon/coolgrid'], transformIR: () => void order.push('first') }),
      ],
    })
    compiler.transform('export function A() { return <Text>a</Text> }', { target: 'swift' })
    expect(order).toEqual(['first', 'second'])
  })

  it('replaces a built-in by name only through `discovered`', () => {
    const replacement = plugin('@pyreon/coolgrid', { services: { useThing: spec } })
    expect(() => createCompiler({ plugins: [replacement] })).toThrow(/Duplicate native compiler plugin/)
    const compiler = createCompiler({ discovered: [replacement] })
    expect(compiler.services.get('useThing')?.owner).toBe('@pyreon/coolgrid')
  })

  it.each([
    [{ services: { useThing: { swift: '', kotlin: ['x'] } } }, /service "useThing"/],
    [{ services: [] }, /services must be an object/],
    [{ modules: [1] }, /modules must be an array/],
    [{ requires: 'a' }, /requires must be an array/],
    [{ builtIn: 'yes' }, /builtIn must be a boolean/],
  ] as const)('rejects a malformed field %#', (extra, message) => {
    expect(() => createCompiler({ plugins: [plugin('bad', extra as Partial<CompilerPlugin>)] })).toThrow(
      message,
    )
  })
})
