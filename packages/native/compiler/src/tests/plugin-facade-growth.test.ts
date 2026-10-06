import { describe, expect, it } from 'vitest'
import { createCompiler } from '../compiler'
import type { DeclEmitter, MemberCallLowering } from '../call-lowering'
import { createPluginScope } from '../plugin-scope'
import { createRegistries } from '../active-registries'
import type { CompilerPlugin } from '../plugin'
import { assertPluginShape } from '../plugin-shape'
import { testNativePlugin } from '../testing'
import { transform } from '../index'

// A third-party plugin that uses every facade surface added in this slice:
//   - `memberCalls`      `toy.ping(expr)` is lowered by the plugin that owns `toy`
//   - `ctx.expr`         the argument is emitted through the full dispatcher
//   - `ctx.state`        a per-component ping counter
//   - `ctx.decls`        how many toys the component declares
//   - `ctx.deferred`     the declaration embeds the ping count, known only after the body
//   - `unlowered`        advice + the exports that do lower
const KEY = '@acme/toy/pings'

const toyDecl = (opts: { fallback?: string | undefined } = {}): DeclEmitter => ({
  swift: (d, ctx) =>
    `@State private var ${ctx.ident(d.name)} = ToyBox(pings: ${ctx.deferred(KEY, opts.fallback)}, toys: ${ctx.decls('@acme/toy', 'toy').length})`,
  kotlin: (d, ctx) =>
    `val ${ctx.ident(d.name)} = remember { ToyBox(${ctx.deferred(KEY, opts.fallback)}, ${ctx.decls('@acme/toy', 'toy').length}) }`,
})

const ping: MemberCallLowering = {
  swift: (call, ctx) => {
    const n = ctx.state('@acme/toy/n', () => ({ count: 0 }))
    n.count += 1
    ctx.resolveDeferred(KEY, String(n.count))
    return `${ctx.ident(call.receiver.name)}.ping(${call.args.map((a) => ctx.expr(a)).join(', ')}, nth: ${n.count})`
  },
  kotlin: (call, ctx) => {
    const n = ctx.state('@acme/toy/n', () => ({ count: 0 }))
    n.count += 1
    ctx.resolveDeferred(KEY, String(n.count))
    return `${ctx.ident(call.receiver.name)}.ping(${call.args.map((a) => ctx.expr(a)).join(', ')}, nth = ${n.count})`
  },
}

const toyPlugin = (over: Partial<CompilerPlugin> = {}): CompilerPlugin => ({
  name: '@acme/toy',
  apiVersion: 1,
  modules: ['@acme/toy'],
  calls: { createToy: () => ({ type: 'toy' }) },
  decls: { toy: toyDecl({ fallback: '0' }) },
  memberCalls: { ping },
  unlowered: { '@acme/toy': { advice: 'use createToy only', supported: ['createToy'] } },
  ...over,
})

const HEAD = `import { createToy } from '@acme/toy'
import { Stack, Button } from '@pyreon/primitives'
`

describe.each(['swift', 'kotlin'] as const)('facade growth on %s', (target) => {
  const compile = (source: string, plugin: CompilerPlugin = toyPlugin()) =>
    testNativePlugin(plugin, HEAD + source, { target })

  it('memberCalls: the plugin lowers a call on its own binding, through ctx.expr', () => {
    const { code } = compile(`
export function App() {
  const toy = createToy()
  return <Button onPress={() => toy.ping(1 + 2)}>go</Button>
}`)
    expect(code).toContain(target === 'swift' ? 'toy.ping(1 + 2, nth: 1)' : 'toy.ping(1L + 2L, nth = 1)')
  })

  it('deferred: the declaration token is replaced once the body has emitted (declaration is emitted BEFORE the body)', () => {
    const { code } = compile(`
export function App() {
  const toy = createToy()
  return <Stack><Button onPress={() => toy.ping(1)}>a</Button><Button onPress={() => toy.ping(2)}>b</Button></Stack>
}`)
    expect(code).toContain(target === 'swift' ? 'ToyBox(pings: 2, toys: 1)' : 'ToyBox(2, 1)')
    expect(code).not.toContain('__PYREON_DEFERRED')
  })

  it('decls: ctx.decls reads every declaration of that plugin + type in THIS component only', () => {
    const { code } = compile(`
export function Two() {
  const a = createToy()
  const b = createToy()
  return <Button onPress={() => a.ping(1)}>x</Button>
}
export function One() {
  const c = createToy()
  return <Button onPress={() => c.ping(1)}>x</Button>
}`)
    const counts = [...code.matchAll(target === 'swift' ? /toys: (\d)/g : /ToyBox\(\d, (\d)\)/g)].map((m) => m[1])
    expect(counts).toEqual(['2', '2', '1'])
  })

  it('state: a fresh bag per component — a second component starts counting from 1', () => {
    const { code } = compile(`
export function A() {
  const toy = createToy()
  return <Stack><Button onPress={() => toy.ping(1)}>a</Button><Button onPress={() => toy.ping(2)}>b</Button></Stack>
}
export function B() {
  const toy = createToy()
  return <Button onPress={() => toy.ping(3)}>c</Button>
}`)
    const nth = [...code.matchAll(target === 'swift' ? /nth: (\d)/g : /nth = (\d)/g)].map((m) => m[1])
    expect(nth).toEqual(['1', '2', '1'])
  })

  it('a call on a binding no plugin declaration created is NOT claimed (dispatch is receiver-keyed)', () => {
    const { code } = compile(`
export function App() {
  const toy = createToy()
  const other = { ping: (n: number) => n }
  return <Button onPress={() => other.ping(1)}>go</Button>
}`)
    expect(code).not.toContain('nth')
  })

  it('two plugins may claim one method name: the receiver decides who lowers it', () => {
    const second: CompilerPlugin = {
      name: '@acme/other',
      apiVersion: 1,
      modules: ['@acme/other'],
      calls: { createOther: () => ({ type: 'other' }) },
      decls: { other: { swift: (d, ctx) => `let ${ctx.ident(d.name)} = Other()`, kotlin: (d, ctx) => `val ${ctx.ident(d.name)} = Other()` } },
      memberCalls: {
        ping: {
          swift: (c, ctx) => `OTHER_${ctx.ident(c.receiver.name)}`,
          kotlin: (c, ctx) => `OTHER_${ctx.ident(c.receiver.name)}`,
        },
      },
    }
    const compiler = createCompiler({ plugins: [toyPlugin(), second] })
    const { code } = compiler.transform(
      `import { createToy } from '@acme/toy'
import { createOther } from '@acme/other'
import { Button } from '@pyreon/primitives'
export function App() {
  const toy = createToy()
  const o = createOther()
  return <Button onPress={() => { toy.ping(1); o.ping(2) }}>go</Button>
}`,
      { target },
    )
    expect(code).toContain('toy.ping(1')
    expect(code).toContain('OTHER_o')
    expect(code).not.toContain('OTHER_toy')
    expect(code).not.toContain('toy.ping(2')
  })

  it('a member call lowering that returns undefined DECLINES: the call emits as without the plugin', () => {
    const declining = toyPlugin({ memberCalls: { ping: { swift: () => undefined, kotlin: () => undefined } } })
    const { code } = compile(`
export function App() {
  const toy = createToy()
  return <Button onPress={() => toy.ping(1)}>go</Button>
}`, declining)
    expect(code).toContain(target === 'swift' ? 'toy.ping(1)' : 'toy.ping(1L)')
    expect(code).not.toContain('nth')
  })

  it('unlowered: plugin-supplied advice names the module; the supported export stays silent', () => {
    const { warnings } = compile(`
import { Frob } from '@acme/toy'
export function App() {
  const toy = createToy()
  return <Button onPress={() => Frob(toy)}>go</Button>
}`)
    const frob = warnings.filter((w) => w.includes('Frob'))
    expect(frob).toHaveLength(1)
    expect(frob[0]).toContain('Instead: use createToy only.')
    expect(warnings.filter((w) => w.startsWith('createToy'))).toEqual([])
  })

  it('is instance-owned: another compiler (and the default) never sees the toy plugin\'s slots', () => {
    const src = HEAD + `
export function App() {
  const toy = createToy()
  return <Button onPress={() => toy.ping(1)}>go</Button>
}`
    const own = createCompiler({ plugins: [toyPlugin()] })
    const first = own.transform(src, { target }).code
    expect(transform(src, { target }).code).not.toContain('nth')
    // The same compiler twice: the state bag and deferred table did not leak between compiles.
    expect(own.transform(src, { target }).code).toBe(first)
    expect(own.registries.calls.memberCalls.has('ping')).toBe(true)
    expect(createCompiler().registries.calls.memberCalls.has('ping')).toBe(false)
  })
})

describe('deferred substitution', () => {
  it('an unresolved token with no fallback is an ERROR naming the key (a placeholder never ships)', () => {
    const plugin = toyPlugin({ decls: { toy: toyDecl() }, memberCalls: undefined })
    expect(() =>
      testNativePlugin(plugin, HEAD + `export function App() { const toy = createToy(); return <Button>go</Button> }`, { target: 'swift' }),
    ).toThrow(/deferred value "@acme\/toy\/pings" was never resolved/)
  })

  it('a fallback resolves an unresolved token (a handle with no chart counts zero series)', () => {
    const { code } = testNativePlugin(toyPlugin(), HEAD + `export function App() { const toy = createToy(); return <Button>go</Button> }`, { target: 'swift' })
    expect(code).toContain('ToyBox(pings: 0, toys: 1)')
  })

  it('module-level scope refuses a deferred token, and a bad key is refused', () => {
    expect(() => createPluginScope().deferred('k')).toThrow(/outside a component/)
    expect(() => createPluginScope([]).deferred('a)b')).toThrow(/must be nonempty and contain no/)
  })

  it('resolution is last-write-wins and finalize is a no-op for text without tokens', () => {
    const scope = createPluginScope([])
    const token = scope.deferred('k', 'fb')
    scope.resolveDeferred('k', 'one')
    scope.resolveDeferred('k', 'two')
    expect(scope.finalize(`a ${token} b ${token}`)).toBe('a two b two')
    expect(createPluginScope([]).finalize('plain')).toBe('plain')
  })
})

describe('unlowered-module registry', () => {
  it('two plugins supplying one module fail to load, naming both', () => {
    const other = toyPlugin({ name: '@acme/toy2', calls: undefined, decls: undefined, memberCalls: undefined })
    expect(() => createCompiler({ plugins: [toyPlugin(), other] })).toThrow(
      /unlowered-module metadata for "@acme\/toy" is supplied by both "@acme\/toy" and "@acme\/toy2"/,
    )
  })

  it('a plugin entry wins over the compiler\'s hand-maintained one for the same module', () => {
    const rx = toyPlugin({ unlowered: { '@pyreon/rx': { advice: 'PLUGIN ADVICE', supported: [] } }, modules: undefined })
    const { warnings } = testNativePlugin(
      rx,
      `import { pipe } from '@pyreon/rx'
import { Text } from '@pyreon/primitives'
export function App() { return <Text>{String(pipe)}</Text> }`,
      { target: 'swift' },
    )
    expect(warnings.some((w) => w.includes('Instead: PLUGIN ADVICE'))).toBe(true)
  })

  it('the built-in charts entry is registry data now, and the default compile still warns with its text', () => {
    expect(createRegistries([]).unlowered.size).toBe(0)
    const compiler = createCompiler()
    expect(compiler.registries.unlowered.get('@pyreon/charts')?.owner).toBe('@pyreon/charts')
    expect(compiler.registries.unlowered.get('@pyreon/charts')?.supported?.has('createChartHandle')).toBe(true)
    const { warnings } = compiler.transform(
      `import { NopeChart } from '@pyreon/charts'
import { Text } from '@pyreon/primitives'
export function App() { return <Text>x</Text> }`,
      { target: 'swift' },
    )
    expect(warnings.join('\n')).toMatch(/Most `@pyreon\/charts` hosts lower to a native PyreonChartCanvas/)
  })
})

describe('shape validation for the new surfaces', () => {
  const shape = (over: object) => () => assertPluginShape({ name: '@acme/bad', apiVersion: 1, ...over })
  it('refuses malformed memberCalls and unlowered with the plugin named', () => {
    expect(shape({ memberCalls: [] })).toThrow(/memberCalls must be an object keyed by method name/)
    expect(shape({ memberCalls: { p: { swift: () => '' } }, decls: {} })).toThrow(/memberCall "p" needs swift and kotlin/)
    expect(shape({ memberCalls: { p: ping } })).toThrow(/declares memberCalls but no decls/)
    expect(shape({ unlowered: [] })).toThrow(/unlowered must be an object keyed by module/)
    expect(shape({ unlowered: { m: { advice: '' } } })).toThrow(/unlowered "m" needs a nonempty advice string/)
    expect(shape({ unlowered: { m: { advice: 'x', supported: [1] } } })).toThrow(/unlowered "m" needs/)
    expect(shape({ unlowered: { m: { advice: 'x', supported: ['a'] } } })).not.toThrow()
    expect(() => createCompiler({ plugins: [{ name: '@acme/bad', apiVersion: 1, unlowered: { m: {} } } as never] })).toThrow(
      /unlowered "m" needs a nonempty advice/,
    )
  })
})
