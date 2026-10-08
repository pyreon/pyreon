import type { EmitContext, ExtModuleItem } from '@pyreon/native-compiler/plugin-api'
import { modelOf, modelScope } from './types'
export function emitSwiftModel(item: ExtModuleItem, ctx: EmitContext): readonly string[] {
  const model = modelOf(item)
  return ctx.memberScope(modelScope(item), () => {
    const lines = ['@available(iOS 17.0, macOS 14.0, *)', '@Observable',
      `final class PyreonModel_${model.modelId}: PyreonModelProtocol {`,
      `    static let shared = PyreonModel_${model.modelId}()`]
    for (const field of model.fields) lines.push(`    var ${ctx.ident(field.name)}: ${ctx.typeText(field.type)} = ${ctx.expr(field.initial, 4)}`)
    for (const view of model.views ?? []) ctx.memberScope(modelScope(item, view.selfParam), () => {
      const type = ctx.inferType(view.expr)
      lines.push(`    var ${ctx.ident(view.name)}: ${type.kind === 'unknown' ? 'Any' : ctx.typeText(type)} { ${ctx.expr(view.expr, 4)} }`)
    })
    for (const method of model.methods ?? []) ctx.memberScope(modelScope(item, method.selfParam), () => lines.push(`    ${ctx.functionDeclaration(method)}`))
    lines.push('    private init() {}', '}')
    return [lines.join('\n')]
  })
}
export function emitKotlinModel(item: ExtModuleItem, ctx: EmitContext): readonly string[] {
  const model = modelOf(item)
  return ctx.memberScope(modelScope(item), () => {
    const lines = [`object PyreonModel_${model.modelId} : PyreonModelProtocol {`]
    for (const field of model.fields) lines.push(`    var ${ctx.ident(field.name)} by mutableStateOf(${ctx.expr(field.initial, 4)})`)
    for (const view of model.views ?? []) ctx.memberScope(modelScope(item, view.selfParam), () => lines.push(`    val ${ctx.ident(view.name)} get() = ${ctx.expr(view.expr, 4)}`))
    for (const method of model.methods ?? []) ctx.memberScope(modelScope(item, method.selfParam), () => lines.push(`    ${ctx.functionDeclaration(method)}`))
    lines.push('}')
    return [lines.join('\n')]
  })
}
