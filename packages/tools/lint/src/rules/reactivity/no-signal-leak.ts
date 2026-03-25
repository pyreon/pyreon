import type { Rule } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

/**
 * Warn when a signal is created but never used.
 *
 * Bad:  `const x = signal(0)` with no reads of `x`
 * Good: Either use the signal or remove it
 *
 * Note: This is a heuristic — it checks if the variable declarator's
 * init is signal() and the variable is only referenced once (the declaration).
 * For a thorough check, a full scope analysis would be needed.
 */
export const noSignalLeak: Rule = {
  meta: {
    id: "pyreon/no-signal-leak",
    description: "Warn when a signal is created but appears unused in the same scope",
    category: "reactivity",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-signal-leak",
  },

  create(context) {
    // Track signal declarations and their usage
    const signalDeclarations = new Map<string, { node: any; used: boolean }>()

    return {
      VariableDeclarator(node: any) {
        if (
          node.id?.type === "Identifier" &&
          node.init?.type === "CallExpression" &&
          isCallTo(node.init, "signal")
        ) {
          signalDeclarations.set(node.id.name, { node, used: false })
        }
      },

      Identifier(node: any) {
        // Mark as used if it's not the declaration itself
        const entry = signalDeclarations.get(node.name)
        if (entry && node !== entry.node.id) {
          entry.used = true
        }
      },

      "Program:exit"() {
        for (const [name, { node, used }] of signalDeclarations) {
          if (!used) {
            const span = getSpan(node)
            context.report({
              message: `Signal \`${name}\` is created but never read. Remove it or use it.`,
              loc: context.getLocation(span.start),
              span,
            })
          }
        }
      },
    }
  },
}
