import { substituteIdentifier, type DeclIR, type ExprIR, type ExtModuleItem, type MemberEmitScope, type TypeIR } from '@pyreon/native-compiler/plugin-api'
export interface ModelIR {
  instanceName: string
  modelId: string
  fields: { name: string; type: TypeIR; initial: ExprIR }[]
  views?: { name: string; expr: ExprIR; selfParam: string }[]
  methods?: (Extract<DeclIR, { kind: 'function' }> & { selfParam: string })[]
}
export const modelOf = (item: ExtModuleItem): ModelIR => item.payload as unknown as ModelIR
/** Each factory can name its receiver differently; typing resolves preceding views in the current receiver scope. */
export function modelScope(item: ExtModuleItem, receiver = 'self'): MemberEmitScope {
  const model = modelOf(item)
  return { name: `PyreonModel_${model.modelId}`, observable: true, receiver,
    declarations: [
      ...model.fields.map(field => ({ kind: 'signal' as const, ...field })),
      ...(model.views ?? []).map(view => ({ kind: 'computed' as const, name: view.name,
        expr: substituteIdentifier(view.expr, view.selfParam, { kind: 'identifier', name: receiver }) ?? view.expr,
      })),
      ...(model.methods ?? []),
    ],
  }
}
