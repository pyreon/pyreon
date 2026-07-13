import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isLogicalAndWithJSX } from '../../utils/ast'

export const noAndConditional: Rule = {
  meta: {
    id: 'pyreon/no-and-conditional',
    category: 'jsx',
    description:
      'Style preference for <Show> over `&&` with JSX. Opt-in — NOT a correctness rule: the compiler lowers `{cond && <el/>}` and `<Show>` to the SAME reactive `_mountSlot(() => …)` accessor, so they mount, swap, and unmount identically. `<Show>` adds `fallback`/`keyed` and a well-tested reactive boundary, but bare `&&` is fully valid conditional rendering.',
    // Opt-in: `&&`-with-JSX is not a bug (the compiler makes it byte-equivalent
    // to `<Show>`), so this must not gate CI on correct code — it was promoted
    // to `error` under `strict`/`lib`, firing on every valid conditional.
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
      LogicalExpression(node: any) {
        if (jsxExpressionDepth === 0) return
        if (!isLogicalAndWithJSX(node)) return
        context.report({
          message:
            '`&&` with JSX renders reactively (the compiler lowers it to the same `_mountSlot` accessor as `<Show>`). Style preference: `<Show when={…}>` reads more clearly and offers `fallback`/`keyed` — but bare `&&` is fully valid.',
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
