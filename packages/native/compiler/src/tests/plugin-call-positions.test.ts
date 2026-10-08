import { withRegistries } from '../active-registries'
import { hashServiceDeclsAsLegacy } from '../registry-lookup'
import { describe, expect, it } from 'vitest'
import { createCompiler } from '../compiler'
import type { CompilerPlugin } from '../plugin'
import type { AstNode, DeclEmitter, ExtPayload, TypeIR } from '../plugin-api'
const tick: DeclEmitter = {
  lifecycleOnly: true,
  legacyKind: 'toy-tick',
  legacyName: false,
  swift: () => '',
  kotlin: () => '',
  lifecycle: {
    stableHost: true,
    earlyOrder: 10,
    swift: () => ['.task {', '  print("tick")', '}'],
    kotlin: () => ['LaunchedEffect(Unit) {', '  println("tick")', '}'],
  },
}
const toy: CompilerPlugin = {
  name: '@acme/position',
  apiVersion: 1,
  modules: ['@acme/position'],
  statementCalls: {
    useTick: (_call, ctx) => {
      if (ctx.stringLiteralArg(0) === 'decline') return undefined
      if (ctx.stringLiteralArg(0) === 'drop') {
        ctx.report('tick intentionally dropped')
        return null
      }
      return { type: 'tick' }
    },
  },
  patternCalls: {
    usePair: (_call, ctx) => {
      if (ctx.stringLiteralArg(0) === 'decline') return undefined
      if (ctx.stringLiteralArg(0) === 'drop') {
        ctx.report('pair intentionally dropped')
        return null
      }
      const fields = (
        ctx.pattern!.properties as (AstNode & { value: AstNode & { name: string } })[]
      ).map((p) => ({ key: ctx.propKey(p)!, local: p.value.name }))
      return { type: 'pair', payload: { fields } }
    },
  },
  decls: {
    tick,
    pair: {
      legacyKind: 'toy-pair',
      legacyName: false,
      swift: (d, ctx) =>
        (d.payload.fields as { key: string; local: string }[])
          .map((p) => `private var ${ctx.ident(p.local)}: String { ${ctx.stringLiteral(p.key)} }`)
          .join('\n  '),
      kotlin: (d, ctx) =>
        (d.payload.fields as { key: string; local: string }[])
          .map((p) => `val ${ctx.ident(p.local)} = ${ctx.stringLiteral(p.key)}`)
          .join('\n  '),
    },
  },
}
const source = (
  from = '@acme/position',
  mode = 'claim',
) => `import { useTick as schedule, usePair as pair } from '${from}'
export function App() { schedule('${mode}'); const { left: label, right } = pair('${mode}'); return <Text>{label}</Text> }`
describe.each(['swift', 'kotlin'] as const)('plugin call positions on %s', (target) => {
  it('claims aliased statement and pattern imports, including owner subpaths', () => {
    const compiler = createCompiler({ plugins: [toy] })
    for (const from of ['@acme/position', '@acme/position/sub']) {
      const r = compiler.transform(source(from), { target })
      expect(r.warnings).toEqual([])
      for (const part of ['tick', 'label', '"left"', '"right"']) expect(r.code).toContain(part)
      if (target === 'swift') expect(r.code).toContain('ZStack {')
    }
  })
  it('does not claim foreign imports with the same exported names', () => {
    const r = createCompiler({ plugins: [toy] }).transform(source('@other/position'), { target })
    expect(r.code).not.toContain('print("tick")')
    expect(r.code).not.toContain('println("tick")')
    expect(r.code).not.toContain('"left"')
  })
  it('undefined declines into the existing fallback while null explicitly drops', () => {
    const compiler = createCompiler({ plugins: [toy] })
    const declined = compiler.transform(source('@acme/position', 'decline'), { target })
    expect(declined.warnings.some((w) => w.includes('bare component-body statement'))).toBe(true)
    const dropped = compiler.transform(source('@acme/position', 'drop'), { target })
    expect(dropped.warnings).toEqual(['tick intentionally dropped', 'pair intentionally dropped'])
    expect(dropped.code).not.toContain('tick')
  })
})
it('rejects competing owners across positions and malformed recognizers', () => {
  expect(() =>
    createCompiler({
      plugins: [toy, { name: 'other', apiVersion: 1, calls: { useTick: () => null }, decls: {} }],
    }),
  ).toThrow('claimed by both')
  for (const position of ['statementCalls', 'patternCalls'])
    expect(() =>
      createCompiler({
        plugins: [
          {
            name: 'invalid',
            apiVersion: 1,
            [position]: { useBad: 1 },
            decls: {},
          } as unknown as CompilerPlugin,
        ],
      }),
    ).toThrow('recognizer function')
})
it('pass inference sees module helpers, component fields and callback-local overrides', () => {
  const seen: TypeIR[] = []
  const compiler = createCompiler({
    plugins: [
      {
        name: 'inference',
        apiVersion: 1,
        transformIR: (module, ctx) => {
          const component = module.components.find((c) => c.name === 'App')!
          for (const expression of [
            {
              kind: 'call',
              callee: { kind: 'identifier', name: 'step' },
              args: [{ kind: 'literal', value: 1 }],
            },
            { kind: 'identifier', name: 'local' },
            { kind: 'identifier', name: 'shadow' },
          ] as const)
            seen.push(
              ctx.inferType(
                module,
                expression as unknown as import('../types').ExprIR,
                component,
                new Map([['shadow', { kind: 'boolean' }]]),
              ),
            )
        },
      },
    ],
  })
  compiler.transform(
    `import { signal } from '@pyreon/reactivity'; function step(x: number) { return x + 0.25 } export function App() { const local = signal('x'); return <Text>{local()}</Text> }`,
    { target: 'swift' },
  )
  expect(seen).toEqual([{ kind: 'number', float: true }, { kind: 'string' }, { kind: 'boolean' }])
})
it.each(['swift', 'kotlin'] as const)(
  'typed arguments and environment reads use the %s backend',
  (target) => {
    const compiler = createCompiler({
      plugins: [
        {
          name: '@acme/typed',
          apiVersion: 1,
          modules: ['@acme/typed'],
          calls: {
            useTyped: (_call, ctx) => ({
              type: 'typed',
              payload: (() => {
                const fn = ctx.functionDeclaration('callback', ctx.args[0]!)
                const initial = ctx.initialType(ctx.expr(ctx.args[1]!))
                expect(fn.params[0]?.type).toEqual({ kind: 'number' })
                expect(initial).toEqual({ kind: 'string' })
                return { fn, initial }
              })() as unknown as ExtPayload,
            }),
          },
          decls: {
            typed: {
              usesColorScheme: true,
              usesSizeClass: true,
              swift: (d, ctx) =>
                `private var ${ctx.ident(d.name)}: Double { ${ctx.argument({ kind: 'literal', value: 1 }, { kind: 'number', float: true })} }`,
              kotlin: (d, ctx) =>
                `val ${ctx.ident(d.name)} = ${ctx.argument({ kind: 'literal', value: 1 }, { kind: 'number', float: true })}`,
            },
          },
        },
      ],
    })
    const r = compiler.transform(
      `import { useTyped } from '@acme/typed'; export function App() { const v = useTyped((x: number) => x, 'x'); return <Text>{v}</Text> }`,
      { target },
    )
    expect(r.code).toContain(target === 'swift' ? 'Double(1)' : '(1L).toDouble()')
    if (target === 'swift') {
      expect(r.code).toContain('pyreonColorScheme')
      expect(r.code).toContain('pyreonSizeClass')
    }
    expect(r.warnings).toEqual([])
  },
)

it.each(['swift', 'kotlin'] as const)(
  'early lifecycle order is independent of declaration order on %s',
  (target) => {
    const declarations = Object.fromEntries(
      [
        ['late', 20],
        ['early', -10],
      ].map(([name, order]) => [
        name,
        {
          ...tick,
          lifecycle: {
            stableHost: true,
            earlyOrder: order as number,
            swift: () => [`.onAppear { print("${name}") }`],
            kotlin: () => [`LaunchedEffect(Unit) { println("${name}") }`],
          },
        },
      ]),
    )
    const compiler = createCompiler({
      plugins: [
        {
          name: '@acme/order',
          apiVersion: 1,
          modules: ['@acme/order'],
          statementCalls: {
            useLate: () => ({ type: 'late' }),
            useEarly: () => ({ type: 'early' }),
          },
          decls: declarations,
        },
      ],
    })
    const r = compiler.transform(
      `import { useLate, useEarly } from '@acme/order'; export function App() { useLate(); useEarly(); return <Text>order</Text> }`,
      { target },
    )
    expect(r.code.indexOf('"early"')).toBeLessThan(r.code.indexOf('"late"'))
    expect(r.code.match(/"early"/g)).toHaveLength(1)
    expect(r.code.match(/"late"/g)).toHaveLength(1)
  },
)
it('legacy nameless hashes omit synthetic bindings and preserve payload field order', () => {
  const compiler = createCompiler({ plugins: [toy] })
  const a = {
    kind: 'ext',
    plugin: toy.name,
    type: 'tick',
    name: '__one',
    payload: { mode: 'once', delay: 10 },
  }
  const b = { ...a, name: '__two' }
  withRegistries(compiler.registries, () => {
    expect(JSON.stringify(a, hashServiceDeclsAsLegacy)).toBe(
      JSON.stringify({ kind: 'toy-tick', mode: 'once', delay: 10 }),
    )
    expect(JSON.stringify(b, hashServiceDeclsAsLegacy)).toBe(
      JSON.stringify(a, hashServiceDeclsAsLegacy),
    )
  })
})
it('Kotlin type spelling can explicitly avoid synthesizing anonymous classes', () => {
  const compiler = createCompiler({
    plugins: [
      {
        name: '@acme/opaque',
        apiVersion: 1,
        modules: ['@acme/opaque'],
        calls: { useOpaque: () => ({ type: 'opaque' }) },
        decls: {
          opaque: {
            swift: () => '',
            kotlin: (decl, ctx) =>
              `val ${ctx.ident(decl.name)}: ${ctx.typeText({ kind: 'array', element: { kind: 'object', fields: [{ name: 'x', type: { kind: 'string' } }] } }, { synthesize: false })} = listOf()`,
          },
        },
      },
    ],
  })
  const r = compiler.transform(
    `import { useOpaque } from '@acme/opaque'; export function App() { const v = useOpaque(); return <Text>opaque</Text> }`,
    { target: 'kotlin' },
  )
  expect(r.code).toContain('val v: List<Any>')
  expect(r.code).not.toContain('data class')
})

it.each(['swift', 'kotlin'] as const)(
  'root wrappers group their declarations and isolate sibling components on %s',
  (target) => {
    const counts: number[] = []
    const wrap = (
      decls: readonly import('../types').ExtDecl[],
      ctx: import('../emit-context').EmitContext,
      next: (indent: number) => string,
    ): string => {
      counts.push(decls.length)
      const host = ctx.target === 'swift' ? 'Group' : 'Box'
      return `${ctx.pad()}${host} {\n${next(ctx.indent + 2)}\n${ctx.pad()}}`
    }
    const compiler = createCompiler({
      plugins: [
        {
          name: '@acme/wrapper',
          apiVersion: 1,
          modules: ['@acme/wrapper'],
          calls: { useWrapper: () => ({ type: 'wrapper' }) },
          decls: {
            wrapper: {
              lifecycleOnly: true,
              swift: () => '',
              kotlin: () => '',
              root: { swift: wrap, kotlin: wrap },
            },
          },
        },
      ],
    })
    const r = compiler.transform(
      `import { useWrapper } from '@acme/wrapper'; export function App() { const a = useWrapper(); const b = useWrapper(); return <Text>inside</Text> } export function Other() { return <Text>outside</Text> }`,
      { target },
    )
    expect(counts).toEqual([2])
    expect(r.code.match(target === 'swift' ? /Group \{/g : /Box \{/g)).toHaveLength(1)
    expect(r.code).toContain('inside')
    expect(r.code).toContain('outside')
    expect(r.warnings).toEqual([])
  },
)

it('root wrapper groups remain distinct when owner and type names contain colons', () => {
  const groups: number[] = []
  const emitter: DeclEmitter = { lifecycleOnly: true, swift: () => '', kotlin: () => '', root: { kotlin: (decls, ctx, next) => { groups.push(decls.length); return next(ctx.indent) } } }
  const compiler = createCompiler({ plugins: [
    { name: 'p:a', apiVersion: 1, modules: ['@acme/first'], calls: { useFirst: () => ({ type: 'b' }) }, decls: { b: emitter } },
    { name: 'p', apiVersion: 1, modules: ['@acme/second'], calls: { useSecond: () => ({ type: 'a:b' }) }, decls: { 'a:b': emitter } },
  ] })
  compiler.transform(`import { useFirst } from '@acme/first'; import { useSecond } from '@acme/second'; export function App() { const a = useFirst(); const b = useSecond(); return <Text>groups</Text> }`, { target: 'kotlin' })
  expect(groups).toEqual([1, 1])
})

it('rejects asynchronous or missing root text before native source is joined', () => {
  for (const root of [() => undefined, async () => 'text']) {
    const compiler = createCompiler({ plugins: [{ name: '@acme/async-root', apiVersion: 1, modules: ['@acme/async-root'], calls: { useRoot: () => ({ type: 'root' }) }, decls: { root: { swift: () => '', kotlin: () => '', root: { kotlin: root as never } } } }] })
    expect(() => compiler.transform(`import { useRoot } from '@acme/async-root'; export function App() { const r = useRoot(); return <Text>root</Text> }`, { target: 'kotlin' })).toThrow('must return a string synchronously')
  }
})
