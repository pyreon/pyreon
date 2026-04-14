import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'
import { createComponentContextTracker } from '../../utils/component-context'

export const noDynamicStyled: Rule = {
  meta: {
    id: 'pyreon/no-dynamic-styled',
    category: 'styling',
    description:
      'Warn when styled() is called inside a component or hook — it creates new CSS on every render.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    // Only flag when *inside* a component / hook setup body. Module-level
    // `styled()` is the correct pattern. Inside a utility function, factory,
    // or test callback `styled()` runs once per call but isn't tied to a
    // render path — the per-render-allocation warning doesn't apply.
    const ctx = createComponentContextTracker()

    const callbacks: VisitorCallbacks = {
      ...ctx.callbacks,
      CallExpression(node: any) {
        if (!ctx.isInComponentOrHook()) return
        if (isCallTo(node, 'styled')) {
          context.report({
            message:
              '`styled()` inside a component or hook — this creates new CSS rules on every render. Move `styled()` to module scope.',
            span: getSpan(node),
          })
        }
      },
      TaggedTemplateExpression(node: any) {
        if (!ctx.isInComponentOrHook()) return
        const tag = node.tag
        if (!tag) return
        // styled('div')`...` — tag is a CallExpression of styled
        if (tag.type === 'CallExpression' && isCallTo(tag, 'styled')) {
          context.report({
            message:
              '`styled()` tagged template inside a component or hook — this creates new CSS rules on every render. Move to module scope.',
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
