import type { Rule } from "../../types"
import { getSpan } from "../../utils/ast"

/**
 * Warn about direct `props.children` access in component renderers.
 *
 * In Pyreon, children live on `vnode.children` and must be merged into props
 * via `mergeChildrenIntoProps` before they're accessible as `props.children`.
 * The runtime handles this automatically for normal components, but custom
 * renderers must call it manually.
 */
export const noChildrenAccess: Rule = {
  meta: {
    id: "pyreon/no-children-access",
    description: "Warn about raw props.children access — may need mergeChildrenIntoProps in custom renderers",
    category: "jsx",
    defaultSeverity: "info",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-children-access",
  },

  create(context) {
    // Only flag in files that look like custom renderers (import from runtime-server/runtime-dom internals)
    let isRendererFile = false

    return {
      ImportDeclaration(node: any) {
        const source = node.source?.value ?? ""
        if (
          source.includes("runtime-server") ||
          source.includes("runtime-dom") ||
          source.includes("renderToString") ||
          source.includes("renderToStream")
        ) {
          isRendererFile = true
        }
      },

      MemberExpression(node: any) {
        if (!isRendererFile) return

        if (
          node.object?.type === "Identifier" &&
          node.property?.type === "Identifier" &&
          node.property.name === "children" &&
          node.object.name === "props"
        ) {
          const span = getSpan(node)
          context.report({
            message:
              "Direct `props.children` access in a renderer file. Ensure `mergeChildrenIntoProps(vnode)` is called before accessing children.",
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}
