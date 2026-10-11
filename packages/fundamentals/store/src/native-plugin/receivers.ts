import { substituteIdentifier, type ExprIR, type ModuleReceiverLowering, type ModuleReceiverSite, type EmitContext } from '@pyreon/native-compiler/plugin-api'
import { storeOf } from './types'

function fieldOf(expr: ExprIR, hook: string): Extract<ExprIR, { kind: 'member' }> | undefined {
  if (expr.kind !== 'member' || expr.object.kind !== 'member' || expr.object.property !== 'store' ||
    expr.object.object.kind !== 'call' || expr.object.object.callee.kind !== 'identifier' ||
    expr.object.object.callee.name !== hook) return undefined
  return expr
}
function emitReceiver(site: ModuleReceiverSite, ctx: EmitContext): string | undefined {
  const store = storeOf(site.receiver)
  const root = `PyreonStore_${store.storeId}${ctx.target === 'swift' ? '.shared' : ''}`
  const member = (name: string) => `${root}.${ctx.observableIdent(name)}`
  const expr = site.expr
  if (expr.kind === 'member') {
    const field = fieldOf(expr, store.hookName)
    return field === undefined ? undefined : member(field.property)
  }
  const field = fieldOf(expr.callee, store.hookName)
  if (field !== undefined) {
    const method = store.methods?.find((candidate) => candidate.name === field.property)
    if (method !== undefined) return `${member(method.name)}(${expr.args.map((arg, i) => ctx.argument(arg, method.params[i]?.type)).join(', ')})`
    if (expr.args.length === 0 && field.object.kind === 'member' && field.object.object.kind === 'call' && field.object.object.args.length === 0) return member(field.property)
    return undefined
  }
  if (expr.callee.kind !== 'member') return undefined
  const target = fieldOf(expr.callee.object, store.hookName)
  if (target === undefined) return undefined
  if (expr.callee.property === 'set') return `${member(target.property)} = ${expr.args[0] === undefined ? '0' : ctx.expr(expr.args[0])}`
  if (expr.callee.property !== 'update' || expr.args.length !== 1) return undefined
  const callback = expr.args[0]!
  if (callback.kind === 'arrow' && callback.params.length === 1) {
    const read: ExprIR = { kind: 'call', callee: target, args: [] }
    const substituted = substituteIdentifier(callback.body, callback.params[0]!, read)
    if (substituted !== null) return `${member(target.property)} = ${ctx.expr(substituted)}`
  }
  ctx.warn('`.update(fn)` lowering supports a single-param expression-body arrow whose param is not shadowed by a nested arrow — this call keeps the raw `.update(` emit (a ' + (ctx.target === 'swift' ? 'swiftc' : 'kotlinc') + ' error at the site). Use `.set(read().…)` or rename the colliding inner param.')
  return undefined
}
export const storeReceivers: ModuleReceiverLowering = { swift: emitReceiver, kotlin: emitReceiver }
