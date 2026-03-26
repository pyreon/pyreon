import type { Rule, VisitorCallbacks } from "../../types"
import { getSpan, isDestructuring } from "../../utils/ast"

function containsJSXReturn(node: any): boolean {
  if (!node) return false
  // Arrow with expression body returning JSX
  if (node.type === "JSXElement" || node.type === "JSXFragment") return true
  if (node.type === "ParenthesizedExpression") return containsJSXReturn(node.expression)

  // Block body — look for return statements with JSX
  if (node.type === "BlockStatement") {
    for (const stmt of node.body ?? []) {
      if (stmt.type === "ReturnStatement" && containsJSXReturn(stmt.argument)) {
        return true
      }
    }
  }
  return false
}

export const noPropsDestructure: Rule = {
  meta: {
    id: "pyreon/no-props-destructure",
    category: "jsx",
    description:
      "Disallow destructuring props in component functions — it breaks signal reactivity.",
    severity: "error",
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      ArrowFunctionExpression(node: any) {
        checkFunction(node, context)
      },
      FunctionDeclaration(node: any) {
        checkFunction(node, context)
      },
      FunctionExpression(node: any) {
        checkFunction(node, context)
      },
    }
    return callbacks
  },
}

function checkFunction(node: any, context: any) {
  const params = node.params
  if (!params || params.length === 0) return

  const firstParam = params[0]
  if (!isDestructuring(firstParam)) return

  // Check if this function returns JSX
  const body = node.body
  if (!body) return

  if (containsJSXReturn(body)) {
    context.report({
      message:
        "Destructured props in a component function — this breaks signal reactivity. Use `props.x` or `splitProps()` instead.",
      span: getSpan(firstParam),
    })
  }
}
