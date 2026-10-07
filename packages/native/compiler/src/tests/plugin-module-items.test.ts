import { describe, expect, it } from 'vitest'
import { withRegistries } from '../active-registries'
import { createCompiler } from '../compiler'
import { moduleTag } from '../expr-utils'
import type { CompilerPlugin } from '../plugin'
import { assertPluginShape } from '../plugin-shape'
import { testNativePlugin } from '../testing'
import { hooksPlugin } from './first-party-plugins'
import type { ParseResult } from '../types'

// The module-level seams the `@pyreon/validate` / `@pyreon/validation` plugins needed: `topLevel` +
// `items` (a plugin's own file-scope declaration, emitted in a plugin-declared slot), `methodCalls` +
// `exprs` (the open `ext-expr` node, rendered and typed by its owner), `items[type].bindings` (the
// value/type rename), `items[type].fieldValidators` (a form naming an item), `refineStructs` (decode
// types settled from items), `finishModule`, and the `legacyList` hash lane. Each is exercised here
// through a toy "units" plugin that is not a schema, so a seam keeps a user that is not validate.

const HEAD = `import { Stack, Text } from '@pyreon/primitives'
`

type Declarator = { id?: { name?: string }; init?: { callee?: { name?: string }; arguments?: { value?: unknown }[] } }

const firstDeclarator = (node: unknown): Declarator | undefined => {
  const n = node as { declarations?: Declarator[]; declaration?: { declarations?: Declarator[] } }
  return (n.declarations ?? n.declaration?.declarations)?.[0]
}

/**
 * A toy "units" library: `const Meters = defineUnit('m')` is a file-scope item, `Meters.convert(x)` an
 * expression over it, `defineNote('…')` an item that emits BEFORE the features slot, and a form may name a
 * unit as its `schema`.
 */
const unitsPlugin = (over: Partial<CompilerPlugin> = {}): CompilerPlugin => ({
  name: '@acme/units',
  apiVersion: 1,
  modules: ['@acme/units'],
  topLevel(node, ctx) {
    const d = firstDeclarator(node)
    const callee = d?.init?.callee?.name
    const name = d?.id?.name
    if (name === undefined) return undefined
    if (callee === 'defineUnit') {
      const symbol = ctx.staticString(d?.init?.arguments?.[0] as never)
      if (symbol === null) {
        ctx.report(`defineUnit \`${name}\`: the symbol must be a string literal.`)
        return undefined
      }
      return { type: 'unit', name, payload: { bindingName: name, symbol, fields: ['label', 'unit'] } }
    }
    if (callee === 'defineDecl') {
      return { type: 'decl', name, payload: { text: ctx.staticString(d?.init?.arguments?.[0] as never) ?? '' } }
    }
    if (callee === 'defineNote') {
      return { type: 'note', name, payload: { text: ctx.staticString(d?.init?.arguments?.[0] as never) ?? '' } }
    }
    return undefined
  },
  items: {
    unit: {
      bindings: {
        names: (item) => [item.name],
        reserved: (item) => [`${item.name}_Sub`],
        rename(item, renames, taken) {
          const to = renames.get(item.name)
          if (to === undefined) return
          const sub = `${to}_Sub`
          if (!taken.has(sub)) {
            taken.add(sub)
            renames.set(`${item.name}_Sub`, sub)
          }
          item.name = to
          item.payload.bindingName = to
        },
      },
      fieldValidators: {
        declaredBy: 'defineUnit',
        fields: (item) => item.payload.fields as string[],
        swift: (item, field, value) => `${item.name}.check(${JSON.stringify(field)}, ${value})`,
        kotlin: (item, field, value) => `${item.name}.check(${JSON.stringify(field)}, ${value})`,
      },
      swift: (item) => [
        `struct AcmeUnit_${item.payload.bindingName} { static let symbol = ${JSON.stringify(item.payload.symbol)} }`,
        `let ${item.name} = AcmeUnit_${item.payload.bindingName}.self`,
      ],
      kotlin: (item) => [
        `object AcmeUnit_${item.payload.bindingName} { const val symbol = ${JSON.stringify(item.payload.symbol)} }`,
        `val ${item.name} = AcmeUnit_${item.payload.bindingName}`,
      ],
    },
    decl: {
      after: 'declarations',
      swift: (item) => [`// decl: ${item.payload.text}`],
      kotlin: (item) => [`// decl: ${item.payload.text}`],
    },
    note: {
      after: 'models',
      swift: (item) => [`// note: ${item.payload.text}`],
      kotlin: (item) => [`// note: ${item.payload.text}`],
    },
  },
  methodCalls: {
    convert(site, ctx) {
      const receiver = site.receiver as { type?: string; name?: string }
      if (receiver.type !== 'Identifier' || receiver.name === undefined) return undefined
      if (site.args.length !== 1) return ctx.unsupported(site.node, `\`${receiver.name}.convert(…)\``, 'convert takes exactly one argument.')
      return { type: 'convert', payload: { unit: receiver.name }, args: [ctx.expr(site.args[0]!)] }
    },
  },
  exprs: {
    convert: {
      swift: (e, ctx) => `AcmeUnit_${String(e.payload.unit)}.convert(${ctx.expr(e.args[0]!)})`,
      kotlin: (e, ctx) => `AcmeUnit_${String(e.payload.unit)}.convert(${ctx.expr(e.args[0]!)})`,
      typing: {
        type: () => ({ kind: 'number', float: true }),
        member: (_e, property) => (property === 'value' ? { kind: 'number', float: true } : { kind: 'unknown' }),
      },
      rename(e, renames) {
        const to = renames.get(String(e.payload.unit))
        if (to !== undefined) (e.payload as { unit: string }).unit = to
      },
    },
  },
  ...over,
})

describe.each(['swift', 'kotlin'] as const)('module-item seams on %s', (target) => {
  it('topLevel + items: the plugin emits its declaration before the components; the other plugin-less shape is unchanged', () => {
    const { code } = testNativePlugin(
      unitsPlugin(),
      `import { defineUnit } from '@acme/units'
${HEAD}const Meters = defineUnit('m')
export function App() { return <Stack><Text>x</Text></Stack> }`,
      { target },
    )
    expect(code).toContain('AcmeUnit_Meters')
    expect(code.indexOf('AcmeUnit_Meters')).toBeLessThan(code.indexOf('struct App') === -1 ? code.indexOf('fun App') : code.indexOf('struct App'))
    // Without the plugin the declaration is not a plugin item.
    const bare = createCompiler().transform(
      `import { defineUnit } from '@acme/units'
${HEAD}const Meters = defineUnit('m')
export function App() { return <Stack><Text>x</Text></Stack> }`,
      { target },
    )
    expect(bare.code).not.toContain('AcmeUnit_')
  })

  it('a recognizer that declines leaves the node to the rest of the chain, and its report is surfaced', () => {
    const { code, warnings } = testNativePlugin(
      unitsPlugin(),
      `import { defineUnit } from '@acme/units'
${HEAD}const Meters = defineUnit(someVar)
export function App() { return <Stack><Text>x</Text></Stack> }`,
      { target },
    )
    expect(code).not.toContain('AcmeUnit_')
    expect(warnings.some((w) => w.includes('defineUnit `Meters`: the symbol must be a string literal.'))).toBe(true)
  })

  it('slots: `models` emits before `declarations`, which emit before the default `data` slot — whatever the order in the file', () => {
    const { code } = testNativePlugin(
      unitsPlugin(),
      `import { defineUnit, defineNote, defineDecl } from '@acme/units'
${HEAD}const Meters = defineUnit('m')
const D = defineDecl('declared')
const N = defineNote('hello')
export function App() { return <Stack><Text>x</Text></Stack> }`,
      { target },
    )
    const note = code.indexOf('// note: hello')
    const decl = code.indexOf('// decl: declared')
    const unit = code.indexOf('AcmeUnit_Meters')
    expect(note).toBeGreaterThanOrEqual(0)
    expect(note).toBeLessThan(decl)
    expect(decl).toBeLessThan(unit)
  })

  it('methodCalls + exprs: the call becomes an ext-expr the plugin renders, with its argument emitted through ctx.expr', () => {
    const { code, warnings } = testNativePlugin(
      unitsPlugin(),
      `import { defineUnit } from '@acme/units'
import { signal } from '@pyreon/reactivity'
${HEAD}const Meters = defineUnit('m')
export function App() {
  const n = signal(2)
  const out = Meters.convert(n() + 1)
  return <Stack><Text>{String(out)}</Text></Stack>
}`,
      { target },
    )
    expect(code).toContain('AcmeUnit_Meters.convert(')
    expect(code).toContain('+ 1')
    expect(warnings.filter((w) => w.includes('convert'))).toEqual([])
  })

  it('typing: the node is typed by the owner (a Double reads through the number formatter), `unknown` without a typing', () => {
    const source = `import { defineUnit } from '@acme/units'
${HEAD}const Meters = defineUnit('m')
export function App() {
  const out = Meters.convert(2)
  return <Stack><Text>{String(out)}</Text></Stack>
}`
    const typed = testNativePlugin(unitsPlugin(), source, { target }).code
    expect(typed).toContain('pyreonNumString(out)')
    const base = unitsPlugin()
    const untyped = testNativePlugin(
      unitsPlugin({ exprs: { convert: { swift: base.exprs!.convert!.swift, kotlin: base.exprs!.convert!.kotlin } } }),
      source,
      { target },
    ).code
    expect(untyped).not.toContain('pyreonNumString(out)')
  })

  it('typing.member: a member read on the node is typed by the owner (a Double property reads through the number formatter)', () => {
    const source = `import { defineUnit } from '@acme/units'
${HEAD}const Meters = defineUnit('m')
export function App() {
  return <Stack><Text>{String(Meters.convert(1).value)}</Text><Text>{String(Meters.convert(1).other)}</Text></Stack>
}`
    const { code } = testNativePlugin(unitsPlugin(), source, { target })
    expect(code).toContain('pyreonNumString(AcmeUnit_Meters.convert(1')
    // `.other` is `unknown`: the owner decided it, so it takes the plain spelling.
    expect(code.split('\n').filter((l) => l.includes('pyreonNumString(AcmeUnit_Meters'))).toHaveLength(1)
  })

  it('a null verdict claims the call, reports it, and substitutes the empty literal', () => {
    const { code, warnings } = testNativePlugin(
      unitsPlugin(),
      `import { defineUnit } from '@acme/units'
${HEAD}const Meters = defineUnit('m')
export function App() {
  const out = Meters.convert(1, 2)
  return <Stack><Text>{String(out)}</Text></Stack>
}`,
      { target },
    )
    expect(code).not.toContain('.convert(')
    expect(warnings.some((w) => w.includes('`Meters.convert(…)` is not supported in native (PMTC) — convert takes exactly one argument.'))).toBe(true)
  })

  it('methodCalls: a call no recognizer claims is the ordinary call, and a decline falls through to the next recognizer', () => {
    const second: CompilerPlugin = {
      name: '@acme/units-b',
      apiVersion: 1,
      methodCalls: { convert: (site) => ({ type: 'convertB', payload: { receiver: (site.receiver as { name?: string }).name ?? '' } }) },
      exprs: { convertB: { swift: () => 'B.swift()', kotlin: () => 'B.kotlin()' } },
    }
    const declining = unitsPlugin({ methodCalls: { convert: () => undefined } })
    const source = `${HEAD}export function App() {
  const out = thing.convert(1)
  return <Stack><Text>{String(out)}</Text></Stack>
}`
    const result = createCompiler({ plugins: [declining, second] }).transform(source, { target })
    expect(result.code).toContain(target === 'swift' ? 'B.swift()' : 'B.kotlin()')
    // Neither plugin loaded: the call is the verbatim member call it always was.
    const bare = createCompiler().transform(source, { target })
    expect(bare.code).toContain('thing.convert(1')
  })

  it("methodCalls '*': sees every method call after the recognizers keyed by its name, so a plugin can warn about any method on a binding it owns", () => {
    const seen: string[] = []
    const plugin = unitsPlugin({
      methodCalls: {
        convert: () => undefined,
        '*': (site, ctx) => {
          seen.push(site.method)
          const receiver = site.receiver as { name?: string }
          return receiver.name === 'Meters' ? ctx.unsupported(site.node, `\`Meters.${site.method}(…)\``, 'only `convert` lowers.') : undefined
        },
      },
    })
    const { code, warnings } = testNativePlugin(
      plugin,
      `import { defineUnit } from '@acme/units'
${HEAD}const Meters = defineUnit('m')
export function App() {
  const a = Meters.explode(1)
  const b = other.keep(1)
  return <Stack><Text>{String(a)}</Text><Text>{String(b)}</Text></Stack>
}`,
      { target },
    )
    expect(seen).toEqual(['explode', 'keep'])
    expect(warnings.some((w) => w.includes('`Meters.explode(…)` is not supported in native (PMTC) — only `convert` lowers.'))).toBe(true)
    // A call the wildcard declines is the ordinary call.
    expect(code).toContain('other.keep(1')
  })

  it('bindings: a value that shares a type name is renamed, and the item, its follow-on name and the expression follow', () => {
    const { code } = testNativePlugin(
      unitsPlugin(),
      `import { defineUnit } from '@acme/units'
${HEAD}export const Meters = defineUnit('m')
export type Meters = { amount: number }
export function App() {
  const out = Meters.convert(1)
  return <Stack><Text>{String(out)}</Text></Stack>
}`,
      { target },
    )
    // The item's own declaration (its struct, its value binding) AND the expression read follow the rename.
    expect(code).toContain('AcmeUnit_MetersValue {')
    expect(code).toContain(target === 'swift' ? 'let MetersValue = AcmeUnit_MetersValue.self' : 'val MetersValue = AcmeUnit_MetersValue')
    expect(code).toContain('AcmeUnit_MetersValue.convert(')
    expect(code).not.toContain('AcmeUnit_Meters {')
    expect(code).not.toMatch(/AcmeUnit_Meters\.convert/)
  })

  it('bindings.reserved: a rename never lands on a name the item already takes', () => {
    const base = unitsPlugin().items!.unit!
    const plugin = unitsPlugin({
      items: { ...unitsPlugin().items, unit: { ...base, bindings: { ...base.bindings!, reserved: (item) => [`${item.name}Value`] } } },
    })
    const { code } = testNativePlugin(
      plugin,
      `import { defineUnit } from '@acme/units'
${HEAD}export const Meters = defineUnit('m')
export type Meters = { amount: number }
export function App() { return <Stack><Text>x</Text></Stack> }`,
      { target },
    )
    expect(code).toContain('AcmeUnit_MetersValue2 {')
    expect(code).not.toContain('AcmeUnit_MetersValue {')
  })

  it('fieldValidators: a form naming the item wires one validator per field, delegating to the plugin', () => {
    const { code } = testNativePlugin(
      unitsPlugin(),
      `import { defineUnit } from '@acme/units'
import { useForm } from '@pyreon/form'
${HEAD}const Meters = defineUnit('m')
export function App() {
  const f = useForm({ initialValues: { label: '', unit: '' }, schema: Meters, onSubmit: () => {} })
  return <Stack><Text>{String(f.isValid())}</Text></Stack>
}`,
      { target },
    )
    expect(code).toContain('Meters.check("label", v)')
    expect(code).toContain('Meters.check("unit", v)')
  })

  it("bindings: a form's `schema:` link follows the rename, so its validators resolve against the renamed item", () => {
    const { code } = testNativePlugin(
      unitsPlugin(),
      `import { defineUnit } from '@acme/units'
import { useForm } from '@pyreon/form'
${HEAD}export const Meters = defineUnit('m')
export type Meters = { amount: number }
export function App() {
  const f = useForm({ initialValues: { label: '' }, schema: Meters, onSubmit: () => {} })
  return <Stack><Text>{String(f.isValid())}</Text></Stack>
}`,
      { target },
    )
    expect(code).toContain('MetersValue.check("label", v)')
    expect(code).not.toContain(' Meters.check(')
  })

  it('refineStructs: a decode type is settled from the item the request names; finishModule sees every item', () => {
    const seen: string[] = []
    const plugin = unitsPlugin({
      refineStructs({ structs, items, decodes }) {
        for (const decode of decodes) {
          if (decode.response === undefined || !items.some((i) => i.name === decode.response!.binding)) continue
          if (decode.type.kind !== 'typeRef') continue
          const struct = structs.find((s) => s.name === (decode.type as { name: string }).name)
          for (const f of struct?.fields ?? []) if (f.type.kind === 'number') f.type = { kind: 'number', float: true }
        }
      },
      finishModule({ items, report }) {
        seen.push(...items.map((i) => `${i.type}:${i.name}`))
        report(`units saw ${items.length} item(s)`)
      },
    })
    const endpoints: CompilerPlugin = {
      name: '@acme/endpoints',
      apiVersion: 1,
      modules: ['@acme/endpoints'],
      requestSources: [
        {
          has: (name) => name === 'getThing',
          resolve: () => ({ url: '/things', method: 'GET', response: { binding: 'Meters', array: false } }),
        },
      ],
    }
    const source = `import { defineUnit } from '@acme/units'
import { useFetch } from '@pyreon/hooks'
${HEAD}const Meters = defineUnit('m')
type Thing = { pages: number }
declare const getThing: (o: object) => unknown
export function App() {
  const t = useFetch<Thing>(getThing({}))
  return <Stack><Text>{String(t.data()?.pages)}</Text></Stack>
}`
    // `useFetch` is the hooks plugin's: it is the consumer of the request source.
    const result = createCompiler({ plugins: [hooksPlugin, plugin, endpoints] }).transform(source, { target })
    expect(result.code).toContain(target === 'swift' ? 'var pages: Double' : 'pages: Double')
    expect(seen).toContain('unit:Meters')
    expect(result.warnings).toContain('units saw 1 item(s)')
  })

  it('addItem: an item synthesized from an expression is appended after the declaration-level ones', () => {
    const plugin = unitsPlugin({
      methodCalls: {
        convert(site, ctx) {
          ctx.addItem({ type: 'note', name: 'Synth', payload: { text: 'synthesized' } })
          return { type: 'convert', payload: { unit: 'Meters' }, args: [ctx.expr(site.args[0]!)] }
        },
      },
    })
    const { code } = testNativePlugin(
      plugin,
      `import { defineUnit, defineNote } from '@acme/units'
${HEAD}export function App() {
  const out = Meters.convert(1)
  return <Stack><Text>{String(out)}</Text></Stack>
}
const N = defineNote('declared')`,
      { target },
    )
    expect(code.indexOf('// note: declared')).toBeLessThan(code.indexOf('// note: synthesized'))
  })
})

describe('module-item registry, hash lane and shape', () => {
  const parsed = (over: Partial<ParseResult>): ParseResult => ({
    imports: [],
    components: [],
    enums: [],
    structs: [],
    moduleDecls: [],
    stores: [],
    models: [],
    moduleItems: [],
    helperFns: [],
    styledComponents: [],
    rocketstyleComponents: [],
    attrsComponents: [],
    aliasImports: new Map(),
    warnings: [],
    ...over,
  })

  // The FNV-1a the compiler hashes with, applied to the JSON of the legacy 13-slot array.
  const fnv = (text: string): string => {
    let h = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
    return h.toString(36)
  }
  const legacyKey = (fieldMetas: unknown[], zodSchemas: unknown[], extra: unknown[] = []): string =>
    fnv(JSON.stringify([[], [], [], [], [], [], fieldMetas, [], zodSchemas, [], [], [], [], ...extra]))

  it('legacyList: an item hashes where the closed array it replaced stood, with its payload as the element', () => {
    const payload = { bindingName: 'Meters', symbol: 'm', fields: ['label'] }
    const item = { plugin: '@acme/units', type: 'unit', name: 'Meters', payload }
    const withLane = (lane: 'fieldMetas' | 'zodSchemas' | undefined) =>
      createCompiler({
        plugins: [unitsPlugin({ items: { unit: { ...unitsPlugin().items!.unit!, ...(lane !== undefined ? { legacyList: lane } : {}) } } })],
      })
    const tag = (compiler: ReturnType<typeof createCompiler>) => withRegistries(compiler.registries, () => moduleTag(parsed({ moduleItems: [item] })))
    // The lane's position (and only the lane's) decides the hash: slot 6 for the metadata array, slot 8 for the schema array.
    expect(tag(withLane('zodSchemas'))).toBe(legacyKey([], [payload]))
    expect(tag(withLane('fieldMetas'))).toBe(legacyKey([payload], []))
    // An item with NO lane hashes as one extra trailing element, so it still moves the tag.
    expect(tag(withLane(undefined))).toBe(legacyKey([], [], [[item]]))
  })

  it('a module with no plugin items hashes as the empty 13-slot array', () => {
    const compiler = createCompiler({ plugins: [unitsPlugin()] })
    expect(withRegistries(compiler.registries, () => moduleTag(parsed({})))).toBe(legacyKey([], []))
  })

  it('assertPluginShape rejects malformed module-level members by name', () => {
    const bad = (extra: object) => () => assertPluginShape({ name: '@acme/bad', apiVersion: 1, ...extra })
    expect(bad({ topLevel: 'x' })).toThrow('topLevel must be a synchronous function')
    expect(bad({ items: { unit: { swift: () => [] } } })).toThrow('items.unit needs a swift and a kotlin function')
    expect(bad({ items: { unit: { swift: () => [], kotlin: () => [], legacyList: 'nope' } } })).toThrow('legacyList must be "fieldMetas", "zodSchemas" or "features"')
    expect(bad({ exprs: { e: { kotlin: () => '' } } })).toThrow('exprs.e needs a swift and a kotlin function')
    expect(bad({ methodCalls: { convert: 1 } })).toThrow('methodCalls.convert must be a synchronous function')
    expect(bad({ refineStructs: 1 })).toThrow('refineStructs must be a synchronous function')
    expect(bad({ finishModule: 1 })).toThrow('finishModule must be a synchronous function')
  })

  it('an item whose type has no emitter, or a payload that is not JSON, fails loudly naming the plugin', () => {
    const missing = unitsPlugin({ topLevel: () => ({ type: 'nope', name: 'X' }) })
    expect(() => createCompiler({ plugins: [missing] }).transform(`${HEAD}const X = 1`, { target: 'swift' })).toThrow(
      /Plugin "@acme\/units" recognized a module item of type "nope" but declares no `items\.nope` emitter/,
    )
    const notJson = unitsPlugin({ topLevel: () => ({ type: 'unit', name: 'X', payload: { f: () => 1 } as never }) })
    expect(() => createCompiler({ plugins: [notJson] }).transform(`${HEAD}const X = 1`, { target: 'swift' })).toThrow(
      /module item "unit" has a payload that is not JSON/,
    )
  })

  it('a throwing recognizer names its plugin and hook', () => {
    const boom = unitsPlugin({ topLevel: () => { throw new Error('kaboom') } })
    expect(() => createCompiler({ plugins: [boom] }).transform(`${HEAD}const X = 1`, { target: 'swift' })).toThrow(
      '[Pyreon] Native compiler plugin "@acme/units" failed in topLevel: kaboom',
    )
  })
})
