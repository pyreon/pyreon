import type { EmitContext, ModuleReceiverLowering, ModuleReceiverSite } from '@pyreon/native-compiler/plugin-api'
import { modelOf } from './types'
function emitReceiver(site: ModuleReceiverSite, ctx: EmitContext): string | undefined {
  const model = modelOf(site.receiver)
  const root = `PyreonModel_${model.modelId}${ctx.target === 'swift' ? '.shared' : ''}`
  const member = (name: string) => `${root}.${ctx.observableIdent(name)}`
  const expr = site.expr
  if (expr.kind === 'member' && expr.object.kind === 'identifier' && expr.object.name === site.receiver.name) return member(expr.property)
  if (expr.kind !== 'call' || expr.callee.kind !== 'member' || expr.callee.object.kind !== 'identifier' || expr.callee.object.name !== site.receiver.name) return undefined
  const property = expr.callee.property
  if (expr.args.length === 0 && (model.fields.some(field => field.name === property) || model.views?.some(view => view.name === property))) return member(expr.callee.property)
  const method = model.methods?.find(candidate => candidate.name === property)
  if (method === undefined) return undefined
  return `${member(method.name)}(${expr.args.map((arg,i) => ctx.argument(arg, method.params[i]?.type)).join(', ')})`
}
export const modelReceivers: ModuleReceiverLowering = { swift: emitReceiver, kotlin: emitReceiver }
