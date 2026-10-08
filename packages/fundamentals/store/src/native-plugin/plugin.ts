import { NATIVE_COMPILER_PLUGIN_API_VERSION, type CompilerPlugin, type ExtPayload, type ModuleItemEmitter, type ModuleScanner, type AstNode, type ModuleParseContext } from '@pyreon/native-compiler/plugin-api'
import { recognizeStore } from './recognize'
import { emitKotlinStore, emitSwiftStore } from './emit'
import { storeReceivers } from './receivers'
import { storeOf, storeScope } from './types'
import { storeStubs } from './stubs'

const scanModule: ModuleScanner = (scan) => {
  for (const node of scan.body) {
    // biome-ignore lint/suspicious/noExplicitAny: ESTree declarations are read structurally.
    const top = node as any
    const declaration = top.type === 'ExportNamedDeclaration' ? top.declaration : top
    if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue
    for (const binding of declaration.declarations ?? []) {
      if (binding.id?.type !== 'Identifier' || binding.init?.type !== 'CallExpression' ||
        binding.init.callee?.type !== 'Identifier' || binding.init.callee.name !== 'defineStore') continue
      const hook = binding.id.name as string
      scan.aliasFactory(hook, { kind: 'call', callee: { kind: 'identifier', name: hook }, args: [] },
        `Destructuring a store api (\`const { … } = ${hook}()\`) is NOT lowered on native — the destructured names emit unbound and the build fails on both targets with "cannot find 'store' in scope". Bind the api instead: \`const api = ${hook}(); api.store.x\` (or read it inline, \`${hook}().store.x\`). Both lower to the same native singleton.`)
    }
  }
}
const storeItem: ModuleItemEmitter = {
  after: 'bindings', legacyList: 'stores',
  receivers: storeReceivers,
  typing: {
    fields: (item) => storeOf(item).fields,
    scopes: (item) => [storeScope(item)],
    type(item, expr, infer) {
      if (expr.kind !== 'call' || expr.args.length !== 0 || expr.callee.kind !== 'member') return undefined
      const member = expr.callee
      if (member.object.kind !== 'member' || member.object.property !== 'store' ||
        member.object.object.kind !== 'call' || member.object.object.args.length !== 0 ||
        member.object.object.callee.kind !== 'identifier' || member.object.object.callee.name !== item.name) return undefined
      const store = storeOf(item)
      const field = store.fields.find(candidate => candidate.name === member.property)
      if (field !== undefined) return field.type
      if (store.computeds?.some(computed => computed.name === member.property)) {
        return infer({ kind: 'call', callee: { kind: 'identifier', name: member.property }, args: [] }, storeScope(item))
      }
      return undefined
    },
  },
  swift: emitSwiftStore,
  kotlin: emitKotlinStore,
}
export const storePlugin: CompilerPlugin = Object.freeze({
  name: '@pyreon/store', apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: Object.freeze(['@pyreon/store']), scanModule,
  topLevel(node: AstNode, ctx: ModuleParseContext) {
    const store = recognizeStore(node, ctx)
    return store === null ? undefined : { type: 'store', name: store.hookName, payload: store as unknown as ExtPayload }
  },
  items: Object.freeze({ store: storeItem }), tier2Calls: Object.freeze(['defineStore']),
  stubs: storeStubs,
})
