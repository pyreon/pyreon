import type { Rule } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

/**
 * Info: effect() inside onMount is redundant — effect() already runs after mount.
 *
 * Bad:  `onMount(() => { effect(() => { ... }) })`
 * Good: `effect(() => { ... })` at component level
 */
export const noEffectInMount: Rule = {
  meta: {
    id: "pyreon/no-effect-in-mount",
    description: "Info: effect() inside onMount is redundant — just use effect() at top level",
    category: "lifecycle",
    defaultSeverity: "info",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-effect-in-mount",
  },

  create(context) {
    let mountDepth = 0

    return {
      CallExpression(node: any) {
        if (isCallTo(node, "onMount")) {
          mountDepth++
        }

        if (mountDepth > 0 && isCallTo(node, "effect")) {
          const span = getSpan(node)
          context.report({
            message:
              "`effect()` inside `onMount()` is redundant. Effects already run after the component mounts. Move to the component level.",
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
      "CallExpression:exit"(node: any) {
        if (isCallTo(node, "onMount")) {
          mountDepth--
        }
      },
    }
  },
}
