import { createPluginScope } from '../plugin-scope'
import { describe, expect, it } from 'vitest'
import { withRegistries } from '../active-registries'
import { createEmitContext } from '../emit-context'
import { createCallRegistry, emitExtDecl, stampExtDecl, type CallRecognizer, type DeclEmitter } from '../call-lowering'
import { createCompiler } from '../compiler'
import { hashServiceDeclsAsLegacy } from '../registry-lookup'
import { parsePyreon } from '../parse'
import type { CompilerPlugin } from '../plugin'
import { assertPluginShape } from '../plugin-shape'
import { testNativePlugin } from '../testing'
import { chartsCompiler, chartsPlugin } from './charts-plugin'
import { hooksPlugin, transform } from './first-party-plugins'

// A plugin-supplied (NOT built-in) code-shaped lowering: it recognizes a call,
// reads its argument, and emits its own declaration on both targets.
const toyDecl = Object.freeze<DeclEmitter>({
  swift: (d, ctx) =>
    `@State private var ${ctx.ident(d.name)} = ToyBox(label: ${ctx.stringLiteral(String(d.payload.label))})`,
  kotlin: (d, ctx) => [
    `val ${ctx.ident(d.name)} = remember { ToyBox(${ctx.stringLiteral(String(d.payload.label))}) }`,
  ],
})
const toyCall: CallRecognizer = (_call, ctx) => {
  const label = ctx.stringLiteralArg(0)
  if (label === undefined) {
    ctx.warn('createToy needs a string literal label')
    return undefined
  }
  return { type: 'toy', payload: { label } }
}
const toyPlugin = (over: Partial<CompilerPlugin> = {}): CompilerPlugin => ({
  name: '@acme/toy',
  apiVersion: 1,
  modules: ['@acme/toy'],
  calls: { createToy: toyCall },
  decls: { toy: toyDecl },
  ...over,
})
const app = (call: string, from = '@acme/toy') => `import { createToy } from '${from}'
import { Text } from '@pyreon/primitives'
export function App() { const toy = ${call}; return <Text>{toy.label}</Text> }`

describe('code-shaped plugin: calls + decls', () => {
  it('lowers a toy hook end to end on both targets, through a plugin supplied to createCompiler', () => {
    const swift = testNativePlugin(toyPlugin(), app("createToy('hello')"), { target: 'swift', requireNoWarnings: true })
    expect(swift.code).toContain('@State private var toy = ToyBox(label: "hello")')
    const kotlin = testNativePlugin(toyPlugin(), app("createToy('hello')"), { target: 'kotlin', requireNoWarnings: true })
    expect(kotlin.code).toContain('val toy = remember { ToyBox("hello") }')
  })

  it('escapes the binding through the facade `ident` (a reserved word)', () => {
    const src = app("createToy('x')").replace('const toy', 'const guard').replace('toy.label', 'guard.label')
    const swift = testNativePlugin(toyPlugin(), src, { target: 'swift' })
    expect(swift.code).toContain('@State private var `guard` = ToyBox')
  })

  it('a recognizer that returns undefined DECLINES: the parser falls through exactly as without the plugin', () => {
    const declined = testNativePlugin(toyPlugin(), app('createToy()'), { target: 'swift' })
    const absent = testNativePlugin({ name: 'noop', apiVersion: 1 }, app('createToy()'), { target: 'swift' })
    expect(declined.code).toBe(absent.code)
    expect(declined.code).not.toContain('ToyBox')
    // ...and the facade `warn` reached the author, attributed to the declaration.
    expect(declined.warnings).toContain('Declaration toy: createToy needs a string literal label')
    expect(absent.warnings).toEqual([])
  })

  it('the compiler stamps plugin + name, so a recognizer cannot claim another plugin\'s type', () => {
    const parsed = withRegistries(createCompiler({ plugins: [toyPlugin()] }).registries, () =>
      parsePyreon(app("createToy('hello')")),
    )
    expect(parsed.components[0]!.decls).toEqual([
      { kind: 'ext', plugin: '@acme/toy', type: 'toy', name: 'toy', payload: { label: 'hello' } },
    ])
  })

  it('claims a name only from @pyreon/* or the plugin\'s modules (binding resolution)', () => {
    const lowered = (from: string) =>
      testNativePlugin(toyPlugin(), app("createToy('hello')", from), { target: 'swift' }).code.includes('ToyBox')
    expect(lowered('@acme/toy')).toBe(true)
    expect(lowered('@acme/toy/sub')).toBe(true) // a module matches exactly or as a `name/` prefix
    expect(lowered('@acme/toys')).toBe(false)
    expect(lowered('./my-toys')).toBe(false)
    expect(lowered('@other/pkg')).toBe(false)
    // A user's own function of the same name is theirs, not the plugin's.
    const local = `import { Text } from '@pyreon/primitives'
function createToy(x: string) { return { label: x } }
export function App() { const toy = createToy('hello'); return <Text>{toy.label}</Text> }`
    expect(testNativePlugin(toyPlugin(), local, { target: 'swift' }).code).not.toContain('ToyBox')
  })

  it('is instance-owned: another compiler (and the default one) does not see the plugin', () => {
    const own = createCompiler({ plugins: [toyPlugin()] })
    const src = app("createToy('hello')")
    expect(own.transform(src, { target: 'swift' }).code).toContain('ToyBox')
    expect(transform(src, { target: 'swift' }).code).not.toContain('ToyBox')
    expect(own.transform(src, { target: 'swift' }).code).toContain('ToyBox')
  })
})

describe('code-shaped plugin: load-time errors', () => {
  it('two plugins claiming one call name fail to load, naming both', () => {
    const other: CompilerPlugin = { ...toyPlugin(), name: '@acme/toy2' }
    expect(() => createCompiler({ plugins: [toyPlugin(), other] })).toThrow(
      /call "createToy" is claimed by both "@acme\/toy" and "@acme\/toy2"/,
    )
  })

  it('a call that is also a service hook fails to load, naming both owners', () => {
    const clash = toyPlugin({ calls: { useShare: toyCall } })
    // Whoever owns the service must be named — so read the owner from the registry rather than hardcoding it.
    const owner = createCompiler({ plugins: [hooksPlugin] }).services.get('useShare')?.owner
    expect(owner, 'useShare must be a registered service for this spec to mean anything').toBeDefined()
    expect(() => createCompiler({ plugins: [hooksPlugin, clash] })).toThrow(
      new RegExp(`hook "useShare" is claimed by both "${owner!.replace(/[/]/g, '\\/')}" \\(services\\) and "@acme\\/toy" \\(calls\\)`),
    )
  })

  it('a call that another loaded plugin already recognizes cannot be re-claimed', () => {
    const clash = toyPlugin({ calls: { createChartHandle: toyCall } })
    expect(() => createCompiler({ plugins: [chartsPlugin, clash] })).toThrow(
      /call "createChartHandle" is claimed by both "@pyreon\/charts" and "@acme\/toy"/,
    )
  })

  it('refuses malformed shapes with the plugin named', () => {
    const shape = (over: object) => () => assertPluginShape({ name: '@acme/bad', apiVersion: 1, ...over })
    expect(shape({ calls: [] })).toThrow(/calls must be an object keyed by hook name/)
    expect(shape({ calls: { a: 1 }, decls: {} })).toThrow(/call "a" must be a recognizer function/)
    expect(shape({ decls: { t: { swift: () => '' } } })).toThrow(/decl "t" needs swift and kotlin/)
    expect(shape({ calls: { a: toyCall } })).toThrow(/declares calls but no decls/)
    expect(() => createCompiler({ plugins: [{ name: '@acme/bad', apiVersion: 1, decls: { t: {} } } as never] })).toThrow(
      /decl "t" needs swift and kotlin/,
    )
  })

  it('a recognizer naming a type with no emitter, or returning a non-JSON payload, fails loudly', () => {
    const noEmitter = toyPlugin({ calls: { createToy: () => ({ type: 'nope' }) } })
    expect(() => testNativePlugin(noEmitter, app("createToy('x')"), { target: 'swift' })).toThrow(
      /Plugin "@acme\/toy" recognized a declaration of type "nope" but declares no `decls.nope` emitter/,
    )
    const notJson = toyPlugin({ calls: { createToy: () => ({ type: 'toy', payload: { f: () => 1 } as never }) } })
    expect(() => testNativePlugin(notJson, app("createToy('x')"), { target: 'swift' })).toThrow(/payload that is not JSON/)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const registry = createCallRegistry([toyPlugin()])
    expect(() => stampExtDecl(registry, '@acme/toy', 'toy', { type: 'toy', payload: cyclic as never })).toThrow(/not JSON/)
    expect(() => stampExtDecl(registry, '@acme/toy', 'toy', { type: 'toy', payload: { n: NaN } })).toThrow(/not JSON/)
    // `undefined` slots (an embedded ExprIR's untyped-lambda `paramTypes[0]`) survive structuredClone: allowed.
    expect(structuredClone(stampExtDecl(registry, '@acme/toy', 'toy', { type: 'toy', payload: { p: [undefined, 'x'] } as never }).payload)).toEqual({ p: [undefined, 'x'] })
    expect(stampExtDecl(registry, '@acme/toy', 'toy', { type: 'toy', payload: { a: [1, 'x', null, { b: true }] } }).payload).toEqual({
      a: [1, 'x', null, { b: true }],
    })
  })

  it('an ext declaration whose plugin is not loaded names the plugin instead of emitting nothing', () => {
    const decl = { kind: 'ext', plugin: '@acme/gone', type: 'toy', name: 't', payload: {} } as const
    const registry = createCallRegistry([])
    expect(registry.names.size).toBe(0)
    const ctx = createEmitContext(
      'swift',
      { emit: () => '', staticAttr: () => undefined, stringLiteral: String, identifier: String, warn: () => {}, expr: () => '', exprAs: () => '', scope: () => createPluginScope(), stringAttr: () => undefined, layoutModifiers: () => '', action: () => '', constExpr: () => undefined, colorScope: () => undefined },
      0,
    )
    expect(() => emitExtDecl(registry, decl, 'swift', ctx)).toThrow(
      /declaration "toy" of plugin "@acme\/gone" has no emitter in this compiler/,
    )
  })
})

describe('the first-party proof: createChartHandle() is a @pyreon/charts plugin declaration', () => {
  it('parses to an ext declaration owned by @pyreon/charts, not a core `kind`', () => {
    const src = `import { createChartHandle } from '@pyreon/charts'
import { Text } from '@pyreon/primitives'
export function App() { const chart = createChartHandle(); return <Text>x</Text> }`
    const parsed = withRegistries(chartsCompiler.registries, () => parsePyreon(src))
    expect(parsed.components[0]!.decls).toEqual([
      { kind: 'ext', plugin: '@pyreon/charts', type: 'chart-handle', name: 'chart', payload: {} },
    ])
  })

  it('hashes as the chart-handle kind it was, so synthesized struct names do not move', () => {
    const decl = { kind: 'ext', plugin: '@pyreon/charts', type: 'chart-handle', name: 'chart', payload: {} }
    const legacy = withRegistries(chartsCompiler.registries, () => JSON.stringify(decl, hashServiceDeclsAsLegacy))
    expect(legacy).toBe(JSON.stringify({ kind: 'chart-handle', name: 'chart' }))
    // A plugin declaration without a legacyKind hashes as itself.
    const toy = { kind: 'ext', plugin: '@acme/toy', type: 'toy', name: 't', payload: { a: 1 } }
    expect(JSON.stringify(toy, hashServiceDeclsAsLegacy)).toBe(JSON.stringify(toy))
  })
})
