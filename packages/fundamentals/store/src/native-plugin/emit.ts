import type { EmitContext, ExtModuleItem, TypeIR } from '@pyreon/native-compiler/plugin-api'
import { type StoreComputed, storeOf, storeScope } from './types'

/**
 * The getter's native type: the explicit `computed<T>(…)` annotation, else what the emitter infers for the body —
 * the expression, or (statement body) the computed itself, which the member scope inferred from its first return.
 */
function computedType(computed: StoreComputed, ctx: EmitContext): TypeIR {
  if (computed.type !== undefined) return computed.type
  if (computed.expr !== undefined) return ctx.inferType(computed.expr)
  const type = ctx.inferType({ kind: 'call', callee: { kind: 'identifier', name: computed.name }, args: [] })
  if (type.kind === 'unknown') {
    ctx.warnOnce(
      `defineStore: the type of block-body computed \`${computed.name}\` could not be inferred from its return — the native getter is typed \`Any\`, which its readers cannot use. Annotate it: \`computed<T>(() => { … })\`.`,
    )
  }
  return type
}

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
      const type = computedType(computed, ctx)
      const typeText = type.kind === 'unknown' ? 'Any' : ctx.typeText(type)
      if (computed.body !== undefined) {
        // The shared statement emitter — the same lines a component's
        // multi-statement computed getter carries. An empty `locals` map
        // seeds the body's own `let`s for inference.
        lines.push(
          `    var ${ctx.ident(computed.name)}: ${typeText} {`,
          ...ctx.statements(computed.body, 8, new Map()).map((line) => `        ${line}`),
          '    }',
        )
      } else {
        lines.push(`    var ${ctx.ident(computed.name)}: ${typeText} { ${ctx.expr(computed.expr!, 4)} }`)
      }
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
    for (const computed of store.computeds ?? []) {
      if (computed.body !== undefined) {
        // A block-body getter needs its type spelled (kotlinc infers a
        // property type from an EXPRESSION getter only).
        const type = computedType(computed, ctx)
        lines.push(
          `    val ${ctx.ident(computed.name)}: ${ctx.typeText(type)} get() {`,
          ...ctx.statements(computed.body, 8, new Map()).map((line) => `        ${line}`),
          '    }',
        )
      } else if (computed.type !== undefined) {
        lines.push(`    val ${ctx.ident(computed.name)}: ${ctx.typeText(computed.type)} get() = ${ctx.expr(computed.expr!, 4)}`)
      } else {
        lines.push(`    val ${ctx.ident(computed.name)} get() = ${ctx.expr(computed.expr!, 4)}`)
      }
    }
    for (const method of store.methods ?? []) lines.push(`    ${ctx.functionDeclaration(method)}`)
    lines.push('}')
    return [lines.join('\n')]
  })
}
