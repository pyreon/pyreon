import {
  topLevelDeclarators,
  unwrapTypeLayers,
  type AstNode,
  type CompilerPlugin,
  type ExtPayload,
} from '@pyreon/native-compiler/plugin-api'
import { parseRocketstyleDefn, resolveRocketstyleUseSite } from './recognize'
import type { RocketstyleComponentIR } from './types'

export const rocketstylePlugin: CompilerPlugin = {
  name: '@pyreon/rocketstyle',
  apiVersion: 2,
  modules: ['@pyreon/rocketstyle'],
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
        ? root.name !== 'rocketstyle'
        : binding.kind !== 'import' ||
          binding.module !== '@pyreon/rocketstyle' ||
          (binding.name !== 'rocketstyle' && binding.name !== 'default')
    )
      return
    const warnings: string[] = []
    const definition = parseRocketstyleDefn(decl.id.name, decl.init, warnings, ctx.theme, root.name)
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
      legacyList: 'rocketstyleComponents',
      swift: () => [],
      kotlin: () => [],
      element(item, element, ctx) {
        const definition = item.payload as unknown as RocketstyleComponentIR
        const dimensions = Object.keys(definition.dims)
        const style = resolveRocketstyleUseSite(
          definition,
          (name) => {
            const value = ctx.staticAttr(element, name)
            return typeof value === 'string' ? value : undefined
          },
          (name) => {
            const found = element.attrs.find((attr) => attr.kind === 'attr' && attr.name === name)
            return found?.kind === 'attr' ? found.value : undefined
          },
          (message) => ctx.warn(message),
        )
        const rest = element.attrs.filter(
          (attr) => !(attr.kind === 'attr' && dimensions.includes(attr.name)),
        )
        return {
          ...element,
          tag: definition.tag,
          attrs: [{ kind: 'attr', name: 'style', value: style }, ...rest],
        }
      },
    },
  },
}
