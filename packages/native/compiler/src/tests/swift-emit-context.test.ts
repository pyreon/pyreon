import { describe, expect, it } from 'vitest'
import { createCompiler, type CompilerPlugin } from '../index'
import type { SwiftEmitContext } from '../emit-context'
import type { JsxElementIR } from '../types'

// A third-party element lowering that uses every `SwiftEmitContext` member the Swift chart
// hosts needed, so each one is proven independent of charts (the plugin is `@acme/toy`, not
// `@pyreon/charts`) and a regression in any single member fails exactly one spec here.
const lowering = (emit: (el: JsxElementIR, ctx: SwiftEmitContext) => string): CompilerPlugin => ({
  name: '@acme/toy',
  apiVersion: 1,
  elements: [{ module: '@acme/toy', tags: ['Toy'], emit: { swift: emit } }],
})

const compile = (plugin: CompilerPlugin, body: string, head = '', inside = '') =>
  createCompiler({ plugins: [plugin] }).transform(
    `import { Toy } from '@acme/toy'
import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
${head}
export function App() {
  const n = signal(0)
  ${inside}
  return (<Stack><Text>{n()}</Text>${body}</Stack>)
}
`,
    { target: 'swift' },
  )

describe('SwiftEmitContext members', () => {
  it('expr / exprAs take an optional indentation', () => {
    const out = compile(
      lowering((el, ctx) => {
        const title = el.attrs.find((a) => a.kind === 'attr' && a.name === 'value')
        if (title?.kind !== 'attr') return 'EmptyView()'
        return `Marker(${ctx.expr(title.value, 6)}, ${ctx.exprAs(undefined, title.value, 2)})`
      }),
      '<Toy value={n() + 1} />',
    )
    expect(out.code).toMatch(/Marker\(n \+ 1, n \+ 1\)/)
  })

  it('stringAttr returns a literal or an interpolation, undefined when absent', () => {
    const out = compile(
      lowering((el, ctx) => `S(${ctx.stringAttr(el, 'a')}, ${ctx.stringAttr(el, 'b')}, ${String(ctx.stringAttr(el, 'c'))})`),
      '<Toy a="lit" b={`x${n()}`} />',
    )
    expect(out.code).toContain('S("lit", "x\\(n)", undefined)')
  })

  it('layoutModifiers lowers the element\'s own styling props', () => {
    const out = compile(lowering((el, ctx) => `Box()${ctx.layoutModifiers(el)}`), '<Toy padding={4} />')
    expect(out.code).toMatch(/Box\(\)\s*\.padding\(/)
  })

  it('handlerName names a module function and declines anything else; action emits a closure body', () => {
    const out = compile(
      lowering((el, ctx) => {
        const h = el.attrs.find((a) => a.kind === 'event')
        if (h?.kind !== 'event') return 'EmptyView()'
        return `H(name: ${String(ctx.handlerName(h.handler))}, body: ${ctx.action(h.handler)})`
      }),
      '<Toy onPress={pick} /><Toy onPress={() => n.set(2)} />',
      '',
      'const pick = () => { n.set(1) }',
    )
    expect(out.code).toContain('H(name: pick,')
    expect(out.code).toContain('H(name: undefined, body: ')
    expect(out.code).toMatch(/H\(name: undefined, body: [^)]*n = 2/s)
  })

  it('constExpr reads a module-level const initializer', () => {
    const out = compile(
      lowering((_el, ctx) => {
        const v = ctx.constExpr('LIMIT')
        return `C(${v === undefined ? 'missing' : ctx.expr(v)}, ${ctx.constExpr('nope') === undefined ? 'none' : 'some'})`
      }),
      '<Toy />',
      'const LIMIT = 42',
    )
    expect(out.code).toContain('C(42, none)')
  })

  it('markColorSchemeUsed makes the component declare the colour-scheme environment value', () => {
    const plain = compile(lowering(() => 'EmptyView()'), '<Toy />')
    expect(plain.code).not.toContain('pyreonColorScheme')
    const used = compile(
      lowering((_el, ctx) => {
        ctx.markColorSchemeUsed()
        return `Text(pyreonColorScheme == .dark ? "d" : "l")`
      }),
      '<Toy />',
    )
    expect(used.code).toContain('@Environment(\\.colorScheme) private var pyreonColorScheme: ColorScheme')
  })

  it('colorScope is the enclosing mode scope: set inside <PyreonUI mode>, restored for a sibling', () => {
    const out = compile(
      lowering((_el, ctx) => `Scope(${ctx.colorScope() === undefined ? 'none' : 'scoped'})`),
      '<Toy /><PyreonUI mode="dark"><Toy /></PyreonUI><Toy />',
      "import { PyreonUI } from '@pyreon/ui-core'",
    )
    expect(out.code.match(/Scope\((none|scoped)\)/g)).toEqual(['Scope(none)', 'Scope(scoped)', 'Scope(none)'])
  })

  it('hostState declares @State into the struct, lists what was declared, replaces a tail, and hands out fresh suffixes', () => {
    const out = compile(
      lowering((_el, ctx) => {
        const before = ctx.hostState.lines().length
        const id = ctx.hostState.freshSuffix()
        ctx.hostState.declare(`@State private var toy_${id}: Int = 0`)
        ctx.hostState.declare('@State private var dropped: Int = 0')
        ctx.hostState.replaceFrom(before + 1, [])
        return `Toy(${ctx.hostState.lines().length - before})`
      }),
      '<Toy /><Toy />',
    )
    expect(out.code).toContain('@State private var toy_1: Int = 0')
    expect(out.code).toContain('@State private var toy_2: Int = 0')
    expect(out.code).not.toContain('dropped')
    expect(out.code.match(/Toy\(1\)/g)).toHaveLength(2)
    // The declarations land in the struct, ahead of `var body`.
    expect(out.code.indexOf('toy_1')).toBeLessThan(out.code.indexOf('var body'))
  })

  it('per-compile state: the suffix restarts and nothing declared leaks into the next compile', () => {
    const plugin = lowering((_el, ctx) => {
      const id = ctx.hostState.freshSuffix()
      ctx.hostState.declare(`@State private var toy_${id}: Int = 0`)
      return 'EmptyView()'
    })
    const compiler = createCompiler({ plugins: [plugin] })
    const src = `import { Toy } from '@acme/toy'
import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() { const n = signal(0); return (<Stack><Text>{n()}</Text><Toy /></Stack>) }`
    const a = compiler.transform(src, { target: 'swift' }).code
    const b = compiler.transform(src, { target: 'swift' }).code
    expect(b).toBe(a)
    expect(a.match(/var toy_/g)).toHaveLength(1)
  })
})
