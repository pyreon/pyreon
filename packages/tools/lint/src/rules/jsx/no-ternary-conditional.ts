import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isTernaryWithJSX } from '../../utils/ast'

export const noTernaryConditional: Rule = {
  meta: {
    id: 'pyreon/no-ternary-conditional',
    category: 'jsx',
    description:
      'Style preference for <Show> over a ternary with JSX branches. Opt-in — NOT a correctness or efficiency rule: the compiler lowers `{cond ? <a/> : <b/>}` and `<Show>` to the SAME reactive `_mountSlot(() => …)` accessor, so they mount, swap, and unmount identically. `<Show>` adds `fallback`/`keyed`, but a ternary is fully valid and not measurably slower.',
    // Opt-in: a ternary-with-JSX is not a bug and is not "less efficient" (the
    // compiler makes it byte-equivalent to `<Show>`), so this must not gate CI
    // on correct code — it was promoted to `error` under `strict`/`lib`.
    optIn: true,
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    let jsxExpressionDepth = 0
    const callbacks: VisitorCallbacks = {
      JSXExpressionContainer() {
        jsxExpressionDepth++
      },
      'JSXExpressionContainer:exit'() {
        jsxExpressionDepth--
      },
      ConditionalExpression(node: any) {
        if (jsxExpressionDepth === 0) return
        if (!isTernaryWithJSX(node)) return
        context.report({
          message:
            'Ternary with JSX renders reactively (the compiler lowers it to the same `_mountSlot` accessor as `<Show>`). Style preference: `<Show when={…} fallback={…}>` reads more clearly — but a ternary is fully valid and not less efficient.',
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
