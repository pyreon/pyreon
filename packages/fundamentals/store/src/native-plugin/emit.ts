import type { EmitContext, ExtModuleItem } from '@pyreon/native-compiler/plugin-api'
import { storeOf, storeScope } from './types'

export function emitSwiftStore(item: ExtModuleItem, ctx: EmitContext): readonly string[] {
  const store = storeOf(item)
  return ctx.memberScope(storeScope(item), () => {
    const lines = [
      '@available(iOS 17.0, macOS 14.0, *)',
      '@Observable',
      `final class PyreonStore_${store.storeId}: PyreonStoreProtocol {`,
      `    static let shared = PyreonStore_${store.storeId}()`,
    ]
    for (const field of store.fields) lines.push(`    var ${ctx.ident(field.name)}: ${ctx.typeText(field.type)} = ${ctx.expr(field.initial, 4)}`)
    for (const computed of store.computeds ?? []) {
      const type = ctx.inferType(computed.expr)
      lines.push(`    var ${ctx.ident(computed.name)}: ${type.kind === 'unknown' ? 'Any' : ctx.typeText(type)} { ${ctx.expr(computed.expr, 4)} }`)
    }
    for (const method of store.methods ?? []) lines.push(`    ${ctx.functionDeclaration(method)}`)
    lines.push('    private init() {}', '}')
    return [lines.join('\n')]
  })
}

export function emitKotlinStore(item: ExtModuleItem, ctx: EmitContext): readonly string[] {
  const store = storeOf(item)
  return ctx.memberScope(storeScope(item), () => {
    const lines = [`object PyreonStore_${store.storeId} : PyreonStore {`]
    for (const field of store.fields) {
      if (field.type.kind === 'array' && field.initial.kind === 'array' && field.initial.elements.length === 0) {
        lines.push(`    var ${ctx.ident(field.name)} by mutableStateOf<${ctx.typeText(field.type)}>(listOf())`)
      } else {
        lines.push(`    var ${ctx.ident(field.name)} by mutableStateOf(${ctx.expr(field.initial, 4)})`)
      }
    }
    for (const computed of store.computeds ?? []) lines.push(`    val ${ctx.ident(computed.name)} get() = ${ctx.expr(computed.expr, 4)}`)
    for (const method of store.methods ?? []) lines.push(`    ${ctx.functionDeclaration(method)}`)
    lines.push('}')
    return [lines.join('\n')]
  })
}
