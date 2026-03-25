import type { Rule } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

/**
 * Disallow styled() calls inside component bodies.
 *
 * Bad:  `const Comp = (props) => { const Div = styled('div')\`...\`; ... }`
 * Good: `const Div = styled('div')\`...\``; at module level
 *
 * styled() generates CSS classes — calling it in render creates new classes each render.
 */
export const noDynamicStyled: Rule = {
  meta: {
    id: "pyreon/no-dynamic-styled",
    description: "Disallow styled() inside component body — creates new CSS on every render",
    category: "styling",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-dynamic-styled",
  },

  create(context) {
    let functionDepth = 0

    return {
      FunctionDeclaration() {
        functionDepth++
      },
      "FunctionDeclaration:exit"() {
        functionDepth--
      },
      ArrowFunctionExpression() {
        functionDepth++
      },
      "ArrowFunctionExpression:exit"() {
        functionDepth--
      },
      FunctionExpression() {
        functionDepth++
      },
      "FunctionExpression:exit"() {
        functionDepth--
      },

      CallExpression(node: any) {
        if (functionDepth === 0) return
        if (!isCallTo(node, "styled")) return

        const span = getSpan(node)
        context.report({
          message:
            "`styled()` inside a component body creates a new CSS class on every render. Move to module scope.",
          loc: context.getLocation(span.start),
          span,
        })
      },

      TaggedTemplateExpression(node: any) {
        if (functionDepth === 0) return

        // styled('div')`...`
        if (
          node.tag?.type === "CallExpression" &&
          isCallTo(node.tag, "styled")
        ) {
          const span = getSpan(node)
          context.report({
            message:
              "`styled()` inside a component body creates a new CSS class on every render. Move to module scope.",
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}
