import type { DeclIR, ExprIR, ExtModuleItem, MemberEmitScope, StatementIR, TypeIR } from '@pyreon/native-compiler/plugin-api'

/**
 * A derived member of the store: an expression body (`computed(() => expr)`) or a statement body
 * (`computed(() => { const x = …; return … })`) — exactly one of `expr` / `body` is set. `type` is the
 * explicit `computed<T>(…)` annotation, when written.
 */
export interface StoreComputed {
  name: string
  expr?: ExprIR
  body?: StatementIR[]
  type?: TypeIR
}

/** The store package owns the shape and interpretation of this module item. */
export interface StoreIR {
  hookName: string
  storeId: string
  fields: { name: string; type: TypeIR; initial: ExprIR }[]
  computeds?: StoreComputed[]
  methods?: Extract<DeclIR, { kind: 'function' }>[]
}
export const storeOf = (item: ExtModuleItem): StoreIR => item.payload as unknown as StoreIR
export function storeScope(item: ExtModuleItem): MemberEmitScope {
  const store = storeOf(item)
  return {
    name: `PyreonStore_${store.storeId}`,
    observable: true,
    declarations: [
      ...store.fields.map((field) => ({ kind: 'signal' as const, ...field })),
      ...(store.computeds ?? []).map((computed) => ({
        kind: 'computed' as const,
        name: computed.name,
        ...(computed.expr === undefined ? {} : { expr: computed.expr }),
        ...(computed.body === undefined ? {} : { body: computed.body }),
      })),
      ...(store.methods ?? []),
    ],
  }
}
