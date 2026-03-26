import type { Rule, VisitorCallbacks } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

export const noSignalLeak: Rule = {
  meta: {
    id: "pyreon/no-signal-leak",
    category: "reactivity",
    description: "Warn about unused signal declarations (potential leaks).",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    const signalDecls = new Map<
      string,
      { span: { start: number; end: number }; declStart: number; declEnd: number }
    >()
    const identifierOccurrences = new Map<string, Array<{ start: number; end: number }>>()

    const callbacks: VisitorCallbacks = {
      VariableDeclarator(node: any) {
        const init = node.init
        if (!init || !isCallTo(init, "signal")) return
        const id = node.id
        if (!id || id.type !== "Identifier") return
        signalDecls.set(id.name, {
          span: getSpan(node),
          declStart: id.start as number,
          declEnd: id.end as number,
        })
      },
      Identifier(node: any) {
        const name: string = node.name
        const existing = identifierOccurrences.get(name)
        if (existing) {
          existing.push({ start: node.start as number, end: node.end as number })
        } else {
          identifierOccurrences.set(name, [
            { start: node.start as number, end: node.end as number },
          ])
        }
      },
      "Program:exit"() {
        for (const [name, { span, declStart, declEnd }] of signalDecls) {
          const occurrences = identifierOccurrences.get(name) ?? []
          // Filter out the declaration identifier itself
          const usages = occurrences.filter((o) => o.start !== declStart || o.end !== declEnd)
          if (usages.length === 0) {
            context.report({
              message: `Signal \`${name}\` is declared but never used — this may be a signal leak.`,
              span,
            })
          }
        }
      },
    }
    return callbacks
  },
}
