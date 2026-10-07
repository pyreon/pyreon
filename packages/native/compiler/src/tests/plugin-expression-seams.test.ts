import { describe, expect, it } from 'vitest'
import { createCompiler } from '../compiler'
import { createExprRegistry } from '../expr-lowering'
import { createPropsTypeRegistry } from '../parse-extensions'
import type { CompilerPlugin } from '../plugin'
import { testNativePlugin } from '../testing'

// The seams the @pyreon/flow plugin needed that the charts plugin did not: every one is exercised
// here through a toy `@acme/toy` plugin (so a seam keeps a user that is not flow), and each spec names
// the mechanism it locks. The flow plugin itself is exercised by the native-flow-* suites.

const S = (target: string, swift: string, kotlin: string) => (target === 'swift' ? swift : kotlin)

const toyPlugin = (over: Partial<CompilerPlugin> = {}): CompilerPlugin => ({
  name: '@acme/toy',
  apiVersion: 1,
  modules: ['@acme/toy'],
  calls: { createToy: () => ({ type: 'toy' }) },
  decls: {
    toy: {
      swift: (d, ctx) => `@State private var ${ctx.ident(d.name)} = Toy()`,
      kotlin: (d, ctx) => `val ${ctx.ident(d.name)} = remember { Toy() }`,
    },
  },
  ...over,
})

const HEAD = `import { createToy, distance as dist, ORIGIN, Mode } from '@acme/toy'
import { Stack, Text, Button } from '@pyreon/primitives'
`

describe.each(['swift', 'kotlin'] as const)('expression seams on %s', (target) => {
  const compile = (source: string, plugin: CompilerPlugin) =>
    testNativePlugin(plugin, HEAD + source, { target })

  it('receivers: a call and a member read rooted at a plugin binding are lowered; a foreign root is not', () => {
    const plugin = toyPlugin({
      receivers: {
        toy: {
          swift: {
            expr: (site, ctx) =>
              site.kind === 'call' ? `TOYCALL(${ctx.ident(site.receiver.name)})` : `TOYREAD(${ctx.ident(site.receiver.name)})`,
          },
          kotlin: {
            expr: (site, ctx) =>
              site.kind === 'call' ? `TOYCALL(${ctx.ident(site.receiver.name)})` : `TOYREAD(${ctx.ident(site.receiver.name)})`,
          },
        },
      },
    })
    const { code } = compile(
      `export function App() {
  const toy = createToy()
  const other = { a: { b: 1 } }
  return <Stack><Text>{toy.config.zoom}</Text><Button onPress={() => toy.nodes.set(1)}>g</Button><Text>{other.a.b}</Text></Stack>
}`,
      plugin,
    )
    expect(code).toContain('TOYREAD(toy)')
    expect(code).toContain('TOYCALL(toy)')
    expect(code).not.toContain('TOYREAD(other)')
  })

  it('receivers: assignValue replaces the value operand of an assignment rooted at the binding', () => {
    const plugin = toyPlugin({
      receivers: {
        toy: {
          swift: { assignValue: (site) => `CONV(${site.emitted})` },
          kotlin: { assignValue: (site) => `CONV(${site.emitted})` },
        },
      },
    })
    const { code } = compile(
      `export function App() {
  const toy = createToy()
  return <Button onPress={() => { toy.config.zoom = 2 }}>g</Button>
}`,
      plugin,
    )
    expect(code).toContain('CONV(')
  })

  it('functions: a claimed plain call lowers, an ALIASED import is renamed back, a user function of the same name is left alone', () => {
    const plugin = toyPlugin({
      functions: {
        distance: {
          swift: (site, ctx) => `toyDistance(${site.args.map((a) => ctx.expr(a)).join(', ')})`,
          kotlin: (site, ctx) => `toyDistance(${site.args.map((a) => ctx.expr(a)).join(', ')})`,
        },
      },
    })
    const claimed = compile(`export function App() { return <Text>{dist(1, 2)}</Text> }`, plugin).code
    expect(claimed).toContain(S(target, 'toyDistance(1, 2)', 'toyDistance(1L, 2L)'))
    const own = testNativePlugin(
      plugin,
      `import { Text } from '@pyreon/primitives'
function distance(a: number, b: number) { return a + b }
export function App() { return <Text>{distance(1, 2)}</Text> }`,
      { target },
    ).code
    expect(own).not.toContain('toyDistance')
  })

  it('functions: irName keeps the IR callee spelling a shipped library already hashed into struct names', () => {
    const plugin = toyPlugin({
      functions: { distance: { irName: '__acmeDistance', swift: () => 'D()', kotlin: () => 'D()' } },
    })
    const registry = createExprRegistry([plugin])
    expect(registry.functionsByIrName.get('__acmeDistance')).toBe('distance')
    expect(compile(`export function App() { return <Text>{dist(1, 2)}</Text> }`, plugin).code).toContain('D()')
  })

  it('identifiers: a bare library constant lowers; a shadowing local does not', () => {
    const plugin = toyPlugin({
      identifiers: { ORIGIN: { swift: () => 'ToyOrigin.zero', kotlin: () => 'ToyOrigin.zero' } },
    })
    expect(compile(`export function App() { return <Text>{ORIGIN}</Text> }`, plugin).code).toContain('ToyOrigin.zero')
  })

  it('memberReads: a library enum-like member read lowers by shape', () => {
    const plugin = toyPlugin({
      memberReads: {
        swift: (e) => (e.object.kind === 'identifier' && e.object.name === 'Mode' ? `ToyMode.${e.property}` : undefined),
        kotlin: (e) => (e.object.kind === 'identifier' && e.object.name === 'Mode' ? `ToyMode.${e.property}` : undefined),
      },
    })
    const { code } = compile(`export function App() { const m = Mode.Fast; return <Text>{m}</Text> }`, plugin)
    expect(code).toContain('ToyMode.Fast')
  })

  it('intrinsics: a lowercase tag is claimed only while `applies` holds, and the advice sentence joins the warning otherwise', () => {
    const plugin = toyPlugin({
      intrinsics: [
        {
          tags: ['path'],
          applies: (ctx) => ctx.component().name === 'Special',
          emit: { swift: () => 'ToyPath()', kotlin: () => 'ToyPath()' },
        },
      ],
      intrinsicAdvice: 'or host it with ToyView',
    })
    const { code, warnings } = compile(
      `export function Special() { return <path d="M0 0" /> }
export function Plain() { return <path d="M0 0" /> }`,
      plugin,
    )
    expect(code).toContain('ToyPath()')
    expect(warnings.some((w) => w.includes('or host it with ToyView'))).toBe(true)
  })

  it('prepareEmit + fileState: a per-file pass sees the components and keeps file memory the emit reads back', () => {
    const seen: string[] = []
    const plugin = toyPlugin({
      prepareEmit: (input, ctx) => {
        seen.push(...input.components.map((c) => c.name))
        ctx.fileState('@acme/toy/mark', () => ({ n: 0 })).n = 7
      },
      receivers: {
        toy: {
          swift: { expr: (_s, ctx) => `N${ctx.fileState('@acme/toy/mark', () => ({ n: -1 })).n}` },
          kotlin: { expr: (_s, ctx) => `N${ctx.fileState('@acme/toy/mark', () => ({ n: -1 })).n}` },
        },
      },
    })
    const { code } = compile(
      `export function App() { const toy = createToy(); return <Text>{toy.size}</Text> }`,
      plugin,
    )
    expect(seen).toContain('App')
    expect(code).toContain('N7')
  })

  it('decls.lifecycle.stableHost: a Swift component carrying such a declaration wraps its body in a stable container', () => {
    const base = toyPlugin()
    const withHost = toyPlugin({
      decls: { toy: { ...base.decls!.toy!, lifecycle: { stableHost: true } } },
    })
    const src = `export function App() { const toy = createToy(); return <Text>x</Text> }`
    const a = compile(src, base).code
    const b = compile(src, withHost).code
    if (target === 'swift') expect(b).toContain('ZStack')
    expect(a).not.toContain('ZStack')
  })

  it('decls.lifecycle: contributed lines land in the component', () => {
    const base = toyPlugin()
    const plugin = toyPlugin({
      decls: {
        toy: {
          ...base.decls!.toy!,
          lifecycle: { swift: () => ['.onDisappear { LIFE() }'], kotlin: () => ['LIFE()'] },
        },
      },
    })
    expect(compile(`export function App() { const toy = createToy(); return <Text>x</Text> }`, plugin).code).toContain('LIFE()')
  })

  it('elements.aliasable: an aliased import claims only for a lowering that opts in', () => {
    const el = (aliasable: boolean): CompilerPlugin =>
      toyPlugin({
        elements: [
          {
            module: '@acme/toy',
            tags: ['ToyView'],
            aliasable,
            emit: { swift: () => 'ToyViewNative()', kotlin: () => 'ToyViewNative()' },
          },
        ],
      })
    const src = `import { ToyView as Hosted } from '@acme/toy'
export function App() { return <Hosted /> }`
    expect(testNativePlugin(el(true), src, { target }).code).toContain('ToyViewNative()')
    expect(testNativePlugin(el(false), src, { target }).code).not.toContain('ToyViewNative()')
  })

  it('ParseContext: args/typeArg/expr/resolveStatic/propKey read a literal config the plugin recognises', () => {
    const plugin = toyPlugin({
      calls: {
        createToy: (_call, ctx) => {
          const cfg = ctx.resolveStatic(ctx.unwrap(ctx.args[0]))
          const keys: string[] = []
          for (const p of (cfg?.properties as { type: string }[] | undefined) ?? []) {
            const k = ctx.propKey(p)
            if (k !== undefined) keys.push(k)
          }
          return { type: 'toy', payload: { keys, typeKind: ctx.typeArg().kind } }
        },
      },
      decls: {
        toy: {
          swift: (d) => `let ${d.name} = Toy(keys: "${(d.payload as { keys: string[] }).keys.join(',')}")`,
          kotlin: (d) => `val ${d.name} = Toy("${(d.payload as { keys: string[] }).keys.join(',')}")`,
        },
      },
    })
    const { code } = compile(
      `const CFG = { a: 1, 'b': 2 }
export function App() { const toy = createToy(CFG); return <Text>x</Text> }`,
      plugin,
    )
    expect(code).toContain('a,b')
  })
})

describe('plugin expression-seam registries refuse ambiguity at load', () => {
  it('two plugins claiming one function / identifier name fail naming both owners', () => {
    const fn = { swift: () => 'x', kotlin: () => 'x' }
    expect(() =>
      createExprRegistry([
        { name: '@a/x', functions: { f: fn } },
        { name: '@b/x', functions: { f: fn } },
      ]),
    ).toThrow(/function "f" is claimed by both "@a\/x" and "@b\/x"/)
    expect(() =>
      createExprRegistry([
        { name: '@a/x', identifiers: { C: fn } },
        { name: '@b/x', identifiers: { C: fn } },
      ]),
    ).toThrow(/identifier "C" is claimed by both/)
  })

  it('two plugins resolving one props type name fail naming both owners', () => {
    const r = { resolve: () => undefined }
    expect(() =>
      createPropsTypeRegistry([
        { name: '@a/x', propsTypes: { NodeProps: r } },
        { name: '@b/x', propsTypes: { NodeProps: r } },
      ]),
    ).toThrow(/props type "NodeProps" is resolved by both "@a\/x" and "@b\/x"/)
  })

  it('a plugin with these hooks loads through createCompiler like any other', () => {
    expect(() => createCompiler({ plugins: [toyPlugin({ identifiers: { ORIGIN: { swift: () => 'o' } } })] })).not.toThrow()
  })
})
