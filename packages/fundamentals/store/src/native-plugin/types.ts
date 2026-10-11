import type { DeclIR, ExprIR, ExtModuleItem, MemberEmitScope, TypeIR } from '@pyreon/native-compiler/plugin-api'

/** The store package owns the shape and interpretation of this module item. */
export interface StoreIR {
  hookName: string
  storeId: string
  fields: { name: string; type: TypeIR; initial: ExprIR }[]
  computeds?: { name: string; expr: ExprIR }[]
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
      ...(store.computeds ?? []).map((computed) => ({ kind: 'computed' as const, ...computed })),
      ...(store.methods ?? []),
    ],
  }
}
