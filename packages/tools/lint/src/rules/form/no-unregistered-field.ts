import type { Rule } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

/**
 * Warn when useField() is called but register() is not called nearby.
 *
 * This is a heuristic — checks if the same scope has both useField and
 * a .register() call or spread of register.
 */
export const noUnregisteredField: Rule = {
  meta: {
    id: "pyreon/no-unregistered-field",
    description: "Warn when useField() is used without calling register() on input",
    category: "form",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-unregistered-field",
  },

  create(context) {
    const scopeStack: Array<{ hasUseField: any | null; hasRegister: boolean }> = []

    return {
      FunctionDeclaration() {
        scopeStack.push({ hasUseField: null, hasRegister: false })
      },
      "FunctionDeclaration:exit"() {
        checkScope(scopeStack.pop(), context)
      },
      ArrowFunctionExpression() {
        scopeStack.push({ hasUseField: null, hasRegister: false })
      },
      "ArrowFunctionExpression:exit"() {
        checkScope(scopeStack.pop(), context)
      },
      FunctionExpression() {
        scopeStack.push({ hasUseField: null, hasRegister: false })
      },
      "FunctionExpression:exit"() {
        checkScope(scopeStack.pop(), context)
      },

      CallExpression(node: any) {
        const scope = scopeStack[scopeStack.length - 1]
        if (!scope) return

        if (isCallTo(node, "useField")) {
          scope.hasUseField = node
        }

        // Check for .register() call
        if (
          node.callee?.type === "MemberExpression" &&
          node.callee.property?.type === "Identifier" &&
          node.callee.property.name === "register"
        ) {
          scope.hasRegister = true
        }

        // Check for register() call (destructured)
        if (isCallTo(node, "register")) {
          scope.hasRegister = true
        }
      },
    }
  },
}

function checkScope(
  scope: { hasUseField: any | null; hasRegister: boolean } | undefined,
  context: any,
) {
  if (!scope || !scope.hasUseField || scope.hasRegister) return

  const span = getSpan(scope.hasUseField)
  context.report({
    message:
      "`useField()` called but `register()` not found in the same component. Call `field.register()` on the input element to connect it to the form.",
    loc: context.getLocation(span.start),
    span,
  })
}
