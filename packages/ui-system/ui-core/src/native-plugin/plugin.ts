import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
  type CompilerPlugin,
  type EmitContext,
  type JsxElementIR,
} from '@pyreon/native-compiler/plugin-api'

function provider(el: JsxElementIR, ctx: EmitContext): string {
  return ctx.withColorScope(el, () => {
    const wrapper = ctx.target === 'swift' ? 'Group' : 'Column'
    const inner = ctx.pad(ctx.indent + 2)
    return `${wrapper} {\n${el.children.map((child) => inner + ctx.child(child, ctx.indent + 2)).join('\n')}\n${ctx.pad()}}`
  })
}

/** Package-owned native providers; the client runtime entry never imports this module. */
export const uiCorePlugin: CompilerPlugin = Object.freeze({
  name: '@pyreon/ui-core',
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: ['@pyreon/ui-core'],
  elements: [
    {
      module: '@pyreon/ui-core',
      tags: ['PyreonUI', 'PyreonUIProvider'],
      emit: { swift: provider, kotlin: provider },
    },
  ],
})
