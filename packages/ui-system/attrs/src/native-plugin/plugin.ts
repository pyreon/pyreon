import {
  topLevelDeclarators,
  unwrapTypeLayers,
  type AstNode,
  type CompilerPlugin,
  type ExtPayload,
} from '@pyreon/native-compiler/plugin-api'
import { parseAttrsDefn } from './recognize'
import type { AttrsComponentIR } from './types'

export const attrsPlugin: CompilerPlugin = {
  name: '@pyreon/attrs',
  apiVersion: 2,
  modules: ['@pyreon/attrs'],
  topLevel(node, ctx) {
    const declaration = node.type === 'ExportNamedDeclaration' ? node.declaration : node
    // The historical frontend accepts one const factory per statement.
    const decls = topLevelDeclarators(node)
    if ((declaration as { kind?: string })?.kind !== 'const' || decls.length !== 1) return
    const decl = decls[0] as { id?: { type?: string; name?: string }; init?: unknown }
    if (decl.id?.type !== 'Identifier' || typeof decl.id.name !== 'string') return
    let root = unwrapTypeLayers(decl.init as AstNode | undefined)
    while (
      root?.type === 'TaggedTemplateExpression' ||
      root?.type === 'CallExpression' ||
      root?.type === 'MemberExpression'
    ) {
      root = unwrapTypeLayers(
        (root.type === 'TaggedTemplateExpression'
          ? root.tag
          : root.type === 'CallExpression'
            ? root.callee
            : root.object) as AstNode | undefined,
      )
    }
    if (root?.type !== 'Identifier' || typeof root.name !== 'string') return
    const binding = ctx.binding(root.name)
    if (
      binding === undefined
        ? root.name !== 'attrs'
        : binding.kind !== 'import' ||
          binding.module !== '@pyreon/attrs' ||
          (binding.name !== 'attrs' && binding.name !== 'default')
    )
      return
    const warnings: string[] = []
    const definition = parseAttrsDefn(decl.id.name, decl.init, warnings, ctx.theme, root.name)
    for (const warning of warnings) ctx.report(warning)
    if (definition === null) return
    return {
      type: 'component',
      name: definition.name,
      payload: definition as unknown as ExtPayload,
    }
  },
  items: {
    component: {
      legacyList: 'attrsComponents',
      swift: () => [],
      kotlin: () => [],
      element(item, element) {
        const definition = item.payload as unknown as AttrsComponentIR
        const supplied = new Set(
          element.attrs.flatMap((attr) => (attr.kind === 'attr' ? [attr.name] : [])),
        )
        const defaults = definition.defaultAttrs
          .filter((attr) => !supplied.has(attr.name))
          .map((attr) => ({ kind: 'attr' as const, ...attr }))
        return { ...element, tag: definition.tag, attrs: [...element.attrs, ...defaults] }
      },
    },
  },
}
