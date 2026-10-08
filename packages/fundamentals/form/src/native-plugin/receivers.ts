import type {
  DeclValueBinding,
  EmitContext,
  ExprIR,
  ReceiverLowering,
  ReceiverSite,
} from '@pyreon/native-compiler/plugin-api'

const accessor = (expr: ExprIR): ExprIR =>
  expr.kind === 'call' && expr.args.length === 0 ? expr.callee : expr
const mapRead = (site: ReceiverSite, ctx: EmitContext): string | undefined => {
  const e = site.expr
  if (e.kind !== 'member') return undefined
  const object = accessor(e.object)
  if (
    object.kind !== 'member' ||
    object.object.kind !== 'identifier' ||
    !['values', 'errors', 'touched'].includes(object.property)
  )
    return undefined
  const fallback = object.property === 'touched' ? 'false' : '""'
  const state = ctx.target === 'kotlin' ? '.value' : ''
  return `(${ctx.ident(site.receiver.name)}.${object.property}${state}[${ctx.stringLiteral(e.property)}] ${ctx.target === 'swift' ? '??' : '?:'} ${fallback})`
}
const formRead = (site: ReceiverSite, ctx: EmitContext): string | undefined => {
  const mapped = mapRead(site, ctx)
  if (mapped !== undefined) return mapped
  const e = site.expr
  if (
    e.kind === 'call' &&
    e.args.length === 0 &&
    e.callee.kind === 'member' &&
    e.callee.object.kind === 'identifier' &&
    ['isValid', 'isSubmitting'].includes(e.callee.property)
  )
    return `${ctx.ident(site.receiver.name)}.${ctx.ident(e.callee.property)}`
  if (
    ctx.target === 'kotlin' &&
    e.kind === 'member' &&
    e.object.kind === 'identifier' &&
    ['values', 'errors', 'touched', 'isSubmitting'].includes(e.property)
  )
    return `${ctx.ident(site.receiver.name)}.${e.property}.value`
  return undefined
}
const valueRead = (site: ReceiverSite, ctx: EmitContext): string | undefined => {
  const e = site.expr
  return e.kind === 'member' && e.object.kind === 'identifier'
    ? `(${ctx.ident(site.receiver.name)}[${ctx.stringLiteral(e.property)}] ${ctx.target === 'swift' ? '??' : '?:'} "")`
    : undefined
}
const arrayRead = (site: ReceiverSite, ctx: EmitContext): string | undefined => {
  const e = site.expr
  if (e.kind !== 'call' || e.callee.kind !== 'member' || e.callee.object.kind !== 'identifier')
    return undefined
  const name = ctx.ident(site.receiver.name)
  if (e.args.length === 0 && ['items', 'length'].includes(e.callee.property))
    return `${name}.${e.callee.property}`
  if (ctx.target === 'swift' && e.callee.property === 'move' && e.args.length <= 2)
    return `${name}.move(${e.args.map((arg, i) => `${i === 0 ? 'from' : 'to'}: ${ctx.expr(arg)}`).join(', ')})`
  return undefined
}
const rowRead = (site: ReceiverSite, ctx: EmitContext): string | undefined => {
  const e = site.expr
  return e.kind === 'call' &&
    e.args.length === 0 &&
    e.callee.kind === 'member' &&
    e.callee.object.kind === 'identifier' &&
    e.callee.property === 'value'
    ? `${ctx.ident(site.receiver.name)}.value`
    : undefined
}
const both = (
  expr: (site: ReceiverSite, ctx: EmitContext) => string | undefined,
): ReceiverLowering => ({ swift: { expr }, kotlin: { expr } })
export const formReceiver = both(formRead)
export const valuesReceiver = both(valueRead)
export const arrayReceiver = both(arrayRead)
export const rowReceiver = both(rowRead)

const valueField = (value: ExprIR): string | undefined => {
  if (value.kind !== 'member') return undefined
  const object = accessor(value.object)
  return object.kind === 'member' &&
    object.object.kind === 'identifier' &&
    object.property === 'values'
    ? value.property
    : undefined
}
export const formValueBinding: DeclValueBinding = {
  swift(value, decl, ctx) {
    const field = valueField(value)
    return field === undefined
      ? undefined
      : `${ctx.ident(decl.name)}.binding(${ctx.stringLiteral(field)})`
  },
  kotlin(value, decl, ctx) {
    const field = valueField(value)
    if (field === undefined) return undefined
    const name = ctx.ident(decl.name)
    const key = ctx.stringLiteral(field)
    return {
      value: `${name}.values.value[${key}] ?: ""`,
      onChange: `{ ${name}.setValue(${key}, it) }`,
    }
  },
}
