import { NATIVE_COMPILER_PLUGIN_API_VERSION, type AstNode, type CompilerPlugin, type ExtPayload, type ModuleItemEmitter, type ModuleParseContext } from '@pyreon/native-compiler/plugin-api'
import { recognizeModel } from './recognize'
import { emitKotlinModel, emitSwiftModel } from './emit'
import { modelReceivers } from './receivers'
import { modelOf, modelScope } from './types'
import { modelStubs } from './stubs'
const modelItem: ModuleItemEmitter = {
  after: 'models', legacyList: 'models', receivers: modelReceivers,
  typing: {
    fields: item => modelOf(item).fields,
    scopes: item => (modelOf(item).methods ?? []).map(method => ({ ...modelScope(item, method.selfParam), declarations: [...modelScope(item, method.selfParam).declarations.filter(decl => decl.kind !== 'function'), method] })),
  },
  swift: emitSwiftModel, kotlin: emitKotlinModel,
}
export const stateTreePlugin: CompilerPlugin = Object.freeze({
  name: '@pyreon/state-tree', apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: Object.freeze(['@pyreon/state-tree']),
  topLevel(node: AstNode, ctx: ModuleParseContext) {
    const model = recognizeModel(node, ctx)
    return model === null ? undefined : { type: 'model', name: model.instanceName, payload: model as unknown as ExtPayload }
  },
  items: Object.freeze({ model: modelItem }), tier2Calls: Object.freeze(['model']), stubs: modelStubs,
})
