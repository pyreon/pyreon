import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

export const preferShowOverDisplay: Rule = {
  meta: {
    id: 'pyreon/prefer-show-over-display',
    category: 'performance',
    description:
      'Suggest <Show> over a conditional `display` style — with the trade-off flagged. Opt-in: toggling `display` keeps a STABLE SSR tree shape (the element is always mounted), which is hydration-safe and ref-safe. `<Show>`/`&&` compile to a slot marker that SSR omits when falsy, changing the tree shape — prefer it only when the node needn’t stay mounted. Neither is universally correct, so this is an opt-in hint.',
    // Opt-in: display-toggling is a legitimate, deliberate SSR-safe technique
    // (stable tree shape across SSR + hydration), so blanket-recommending
    // `<Show>` is imprecise. Non-gating already (`info`); off by default.
    optIn: true,
    severity: 'info',
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXAttribute(node: any) {
        if (node.name?.type !== 'JSXIdentifier' || node.name.name !== 'style') return
        const value = node.value
        if (!value || value.type !== 'JSXExpressionContainer') return
        const expr = value.expression
        if (!expr || expr.type !== 'ObjectExpression') return

        for (const prop of expr.properties ?? []) {
          if (prop.type !== 'Property') continue
          const key = prop.key
          if (!key) continue
          const propName =
            key.type === 'Identifier' ? key.name : key.type === 'Literal' ? key.value : null
          if (propName === 'display') {
            // Check if the value is conditional
            const val = prop.value
            if (
              val?.type === 'ConditionalExpression' ||
              val?.type === 'LogicalExpression' ||
              val?.type === 'CallExpression'
            ) {
              context.report({
                message:
                  'Conditional `display` toggling keeps a stable SSR tree shape (hydration-safe, ref-safe). `<Show>` removes the hidden DOM/CSS but changes the tree shape (SSR omits the slot when falsy) — prefer it only when the node needn’t stay mounted.',
                span: getSpan(prop),
              })
            }
          }
        }
      },
    }
    return callbacks
  },
}
