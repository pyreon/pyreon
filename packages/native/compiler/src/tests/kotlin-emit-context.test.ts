import { describe, expect, it } from 'vitest'
import { createCompiler, type CompilerPlugin } from '../index'
import type { EmitContext } from '../emit-context'
import type { JsxElementIR } from '../types'

// A third-party element lowering that uses every `EmitContext` member the chart hosts needed on BOTH
// targets (`stringAttr`, `layoutModifiers`, `action`, `constExpr`, `colorScope`), here on the Kotlin side, so each is
// proven independent of charts (the plugin is `@acme/toy`, not `@pyreon/charts`) and a regression in
// any single member fails exactly one spec here. `swift-emit-context.test.ts` is the Swift twin.
const lowering = (emit: (el: JsxElementIR, ctx: EmitContext) => string): CompilerPlugin => ({
  name: '@acme/toy',
  apiVersion: 1,
  elements: [{ module: '@acme/toy', tags: ['Toy'], emit: { kotlin: emit } }],
  // The scope itself belongs to a plugin: the core opens it around `<PyreonUI mode>`'s children, the toy supplies the value.
  scopes: [{ module: '@pyreon/ui-core', tags: ['PyreonUI'], enter: () => ({ pinned: true }) }],
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
    { target: 'kotlin' },
  )

describe('EmitContext members both targets supply (Kotlin)', () => {
  it('expr / exprAs take an optional indentation', () => {
    const out = compile(
      lowering((el, ctx) => {
        const title = el.attrs.find((a) => a.kind === 'attr' && a.name === 'value')
        if (title?.kind !== 'attr') return 'Box {}'
        return `Marker(${ctx.expr(title.value, 6)}, ${ctx.exprAs(undefined, title.value, 2)})`
      }),
      '<Toy value={n() + 1} />',
    )
    expect(out.code).toContain('Marker(n + 1L, n + 1L)')
  })

  it('stringAttr returns a literal or an interpolation, undefined when absent', () => {
    const out = compile(
      lowering((el, ctx) => `S(${ctx.stringAttr(el, 'a')}, ${ctx.stringAttr(el, 'b')}, ${String(ctx.stringAttr(el, 'c'))})`),
      '<Toy a="lit" b={`x${n()}`} />',
    )
    expect(out.code).toContain('S("lit", "x${n}", undefined)')
  })

  it("layoutModifiers lowers the element's own styling props", () => {
    const out = compile(lowering((el, ctx) => `Box(modifier = ${ctx.layoutModifiers(el)})`), '<Toy padding={4} />')
    expect(out.code).toMatch(/Box\(modifier = Modifier\.padding\(/)
  })

  it('action emits a closure body', () => {
    const out = compile(
      lowering((el, ctx) => {
        const h = el.attrs.find((a) => a.kind === 'event')
        if (h?.kind !== 'event') return 'Box {}'
        return `H(${ctx.action(h.handler)})`
      }),
      '<Toy onPress={() => n.set(2)} />',
    )
    expect(out.code).toMatch(/H\([^)]*n = 2/s)
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
    expect(out.code).toContain('C(42L, none)')
  })

  it('colorScope is the enclosing mode scope: set inside <PyreonUI mode>, restored for a sibling', () => {
    const out = compile(
      lowering((_el, ctx) => `Scope(${ctx.colorScope() === undefined ? 'none' : 'scoped'})`),
      '<Toy /><PyreonUI mode="dark"><Toy /></PyreonUI><Toy />',
      "import { PyreonUI } from '@pyreon/ui-core'",
    )
    expect(out.code.match(/Scope\((none|scoped)\)/g)).toEqual(['Scope(none)', 'Scope(scoped)', 'Scope(none)'])
  })

  it('the claimed element passes the spread / unread-JSX-attribute checks before the plugin runs', () => {
    const out = compile(lowering(() => 'Box {}'), '<Toy {...rest} />', '', 'const rest = { a: 1 }')
    expect(out.warnings.join('\n')).toContain('<Toy {...}> spread is not lowered to native')
  })
})
