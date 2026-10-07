import { describe, expect, it } from 'vitest'
import { createCompiler } from '../compiler'
import type { CompilerPlugin } from '../plugin'
import type { AstNode } from '../call-lowering'
import type { MemberEmitScope } from '../emit-context'
import type { DeclIR, ExprIR, ExtModuleItem, ExtPayload, TypeIR } from '../types'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

type FunctionDecl = Extract<DeclIR, { kind: 'function' }>
type Field = { name: string; type: TypeIR; initial: ExprIR }
function declarationScope(item: ExtModuleItem): MemberEmitScope {
  return { name: item.name, declarations: [
    { kind: 'signal', ...(item.payload.field as unknown as Field) },
    item.payload.method as unknown as FunctionDecl,
  ] }
}
function moduleCompiler() {
  const plugin: CompilerPlugin = {
    name: '@acme/module-inference', apiVersion: 1, modules: ['@acme/module-inference'],
    topLevel(node, ctx) {
      const d = (node as { declarations?: { id?: { name?: string }; init?: AstNode & { callee?: { name?: string }; arguments?: AstNode[] } }[] }).declarations?.[0]
      if (d?.init?.callee?.name !== 'moduleBox' || !d.id?.name) return undefined
      const method = ctx.functionDeclaration('apply', d.init.arguments![0]!)
      const field: Field = { name: 'total', type: ctx.typeArgs(d.init)[0]!, initial: ctx.expr(d.init.arguments![1]!) }
      return { type: 'box', name: d.id.name, payload: { method: method as unknown as ExtPayload['method'], field: field as unknown as ExtPayload['field'] } }
    },
    prepareIR(module) {
      const snapshot = module.components.find((component) => component.name === 'App')?.decls.find((decl) => decl.kind === 'signal' && decl.name === 'snapshot')
      expect(snapshot).toMatchObject({ kind: 'signal', type: { kind: 'number', float: true } })
    },
    items: {
      box: {
        typing: {
          fields: (item) => [item.payload.field as unknown as Field],
          scopes: (item) => [declarationScope(item)],
          type(item, expr, infer) {
            if (expr.kind === 'call' && expr.callee.kind === 'member' && expr.callee.property === 'apply') return (item.payload.method as unknown as FunctionDecl).returnType
            if (expr.kind === 'member' && expr.property === 'total') return infer({ kind: 'call', callee: { kind: 'identifier', name: 'total' }, args: [] }, declarationScope(item))
            return undefined
          },
        },
        receivers: {
          swift(site, ctx) {
            if (site.expr.kind === 'member' && site.expr.property === 'total') return `${site.receiver.name}.shared.total`
            if (site.expr.kind !== 'call' || site.expr.callee.kind !== 'member' || site.expr.callee.property !== 'apply') return undefined
            const method = site.receiver.payload.method as unknown as FunctionDecl
            return `${site.receiver.name}.shared.apply(${site.expr.args.map((arg, i) => ctx.argument(arg, method.params[i]?.type)).join(', ')})`
          },
          kotlin(site, ctx) {
            if (site.expr.kind === 'member' && site.expr.property === 'total') return `${site.receiver.name}.total`
            if (site.expr.kind !== 'call' || site.expr.callee.kind !== 'member' || site.expr.callee.property !== 'apply') return undefined
            const method = site.receiver.payload.method as unknown as FunctionDecl
            return `${site.receiver.name}.apply(${site.expr.args.map((arg, i) => ctx.argument(arg, method.params[i]?.type)).join(', ')})`
          },
        },
        swift(item, ctx) {
          return ctx.memberScope(declarationScope(item), () => [`final class ${item.name} {\n    static let shared = ${item.name}()\n    var total: ${ctx.typeText((item.payload.field as unknown as Field).type)} = ${ctx.expr((item.payload.field as unknown as Field).initial)}\n    ${ctx.functionDeclaration(item.payload.method as unknown as FunctionDecl)}\n}`])
        },
        kotlin(item, ctx) {
          return ctx.memberScope(declarationScope(item), () => [`object ${item.name} {\n    var total: ${ctx.typeText((item.payload.field as unknown as Field).type)} = ${ctx.expr((item.payload.field as unknown as Field).initial)}\n    ${ctx.functionDeclaration(item.payload.method as unknown as FunctionDecl)}\n}`])
        },
      },
    },
  }
  return createCompiler({ discovered: [plugin] })
}
const SOURCE = `import { moduleBox } from '@acme/module-inference'
import { computed, signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
const FRACTION = 0.5
const ExampleModule = moduleBox<number>((amount: number = 0.25): number => total() + amount, FRACTION)
export function App() {
  const whole = signal(2)
  const doubled = computed(() => ExampleModule.total * 2)
  const snapshot = signal<number>(ExampleModule.apply())
  return <Stack><Text>{snapshot()}</Text><Text>{doubled()}</Text><Text>{ExampleModule.apply()}</Text><Text>{ExampleModule.apply(whole())}</Text></Stack>
}`

describe('plugin-owned module inference', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`refines defaults and returns before lowering callers on ${target}`, () => {
      const code = moduleCompiler().transform(SOURCE, { target }).code
      expect(code).toContain('var total: Double = FRACTION')
      expect(code).toContain(target === 'swift' ? 'func apply(_ amount: Double = 0.25) -> Double' : 'fun apply(amount: Double = 0.25): Double')
      expect(code).toContain(target === 'swift' ? 'ExampleModule.shared.apply(Double(whole))' : 'ExampleModule.apply((whole).toDouble())')
    })
  }
  it.skipIf(!isSwiftcAvailable())('compiles the complete third-party module and its integer caller with Swift', () => {
    const result = validateSwiftWithStubs(moduleCompiler().transform(SOURCE, { target: 'swift' }).code)
    expect(result.skipped).not.toBe(true)
    expect(result.ok, result.error).toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('compiles the complete third-party module and its integer caller with Kotlin', () => {
    const result = validateKotlin(moduleCompiler().transform(SOURCE, { target: 'kotlin' }).code)
    expect(result.skipped).not.toBe(true)
    expect(result.ok, result.error).toBe(true)
  })
})
