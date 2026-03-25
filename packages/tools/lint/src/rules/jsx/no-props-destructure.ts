import type { Rule } from "../../types"
import { getSpan, isDestructuring } from "../../utils/ast"

/**
 * Disallow destructuring component props — breaks signal reactivity tracking.
 *
 * Bad:  `const MyComp = ({ name, count }) => ...`
 * Good: `const MyComp = (props) => ...` then use `props.name`, `props.count`
 *       or `const [local, rest] = splitProps(props, ["name"])`
 *
 * Destructuring eagerly reads prop values, breaking the reactive proxy.
 */
export const noPropsDestructure: Rule = {
  meta: {
    id: "pyreon/no-props-destructure",
    description: "Disallow destructuring component props — breaks signal reactivity tracking",
    category: "jsx",
    defaultSeverity: "error",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-props-destructure",
  },

  create(context) {
    return {
      // Arrow function components: const Comp = ({ x }) => <div/>
      ArrowFunctionExpression(node: any) {
        if (!returnsJSX(node)) return
        checkParams(node, context)
      },

      // Function declaration components: function Comp({ x }) { return <div/> }
      FunctionDeclaration(node: any) {
        if (!node.id?.name || node.id.name[0] !== node.id.name[0].toUpperCase()) return
        checkParams(node, context)
      },

      // Function expression components
      FunctionExpression(node: any) {
        if (!returnsJSX(node)) return
        checkParams(node, context)
      },
    }
  },
}

function checkParams(node: any, context: any) {
  const firstParam = node.params?.[0]
  if (!firstParam) return

  if (isDestructuring(firstParam)) {
    const span = getSpan(firstParam)
    context.report({
      message:
        "Destructuring component props breaks reactivity. Use `props.x` or `splitProps(props, [...])` instead.",
      loc: context.getLocation(span.start),
      span,
    })
  }
}

/** Heuristic: does this function likely return JSX? */
function returnsJSX(node: any): boolean {
  const body = node.body
  if (!body) return false

  // Arrow with expression body: ({ x }) => <div/>
  if (body.type === "JSXElement" || body.type === "JSXFragment") return true

  // Arrow with parenthesized JSX: ({ x }) => (<div/>)
  if (body.type === "ParenthesizedExpression") {
    return (
      body.expression?.type === "JSXElement" || body.expression?.type === "JSXFragment"
    )
  }

  // Block body — check last return statement
  if (body.type === "BlockStatement") {
    for (const stmt of body.body ?? []) {
      if (stmt.type === "ReturnStatement") {
        const arg = stmt.argument
        if (!arg) continue
        if (arg.type === "JSXElement" || arg.type === "JSXFragment") return true
        if (
          arg.type === "ParenthesizedExpression" &&
          (arg.expression?.type === "JSXElement" || arg.expression?.type === "JSXFragment")
        ) {
          return true
        }
      }
    }
  }

  return false
}
