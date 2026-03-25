import type { Rule } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

/**
 * Disallow creating signals inside loops or render functions.
 *
 * Bad:  `items.map(item => { const s = signal(item); ... })`
 * Good: Create signals at component setup level.
 *
 * Signals created in loops are recreated every render, causing memory leaks
 * and lost state.
 */
export const noSignalInLoop: Rule = {
  meta: {
    id: "pyreon/no-signal-in-loop",
    description: "Disallow signal() inside loops — creates signals on every iteration",
    category: "reactivity",
    defaultSeverity: "error",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-signal-in-loop",
  },

  create(context) {
    let loopDepth = 0

    return {
      ForStatement() {
        loopDepth++
      },
      "ForStatement:exit"() {
        loopDepth--
      },
      ForInStatement() {
        loopDepth++
      },
      "ForInStatement:exit"() {
        loopDepth--
      },
      ForOfStatement() {
        loopDepth++
      },
      "ForOfStatement:exit"() {
        loopDepth--
      },
      WhileStatement() {
        loopDepth++
      },
      "WhileStatement:exit"() {
        loopDepth--
      },
      DoWhileStatement() {
        loopDepth++
      },
      "DoWhileStatement:exit"() {
        loopDepth--
      },

      CallExpression(node: any) {
        if (loopDepth === 0) return
        if (!isCallTo(node, "signal") && !isCallTo(node, "computed")) return

        const name = node.callee.name
        const span = getSpan(node)
        context.report({
          message: `\`${name}()\` inside a loop creates a new signal on every iteration. Move signal creation to component setup.`,
          loc: context.getLocation(span.start),
          span,
        })
      },
    }
  },
}
