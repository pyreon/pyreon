import {
  topLevelDeclarators,
  unwrapTypeLayers,
  type AstNode,
  type CompilerPlugin,
  type ExtPayload,
} from '@pyreon/native-compiler/plugin-api'
import { parseStyledDefn } from './recognize'
import type { StyledComponentIR } from './types'

export const stylerPlugin: CompilerPlugin = {
  name: '@pyreon/styler',
  apiVersion: 2,
  modules: ['@pyreon/styler'],
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
        ? root.name !== 'styled'
        : binding.kind !== 'import' ||
          binding.module !== '@pyreon/styler' ||
          (binding.name !== 'styled' && binding.name !== 'default')
    )
      return
    const warnings: string[] = []
    const definition = parseStyledDefn(node, { warnings, theme: ctx.theme }, root.name)
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
      legacyList: 'styledComponents',
      swift: () => [],
      kotlin: () => [],
      element(item, element) {
        const definition = item.payload as unknown as StyledComponentIR
        return {
          ...element,
          tag: definition.tag,
          attrs: [{ kind: 'attr', name: 'style', value: definition.styleObject }, ...element.attrs],
        }
      },
    },
  },
}
