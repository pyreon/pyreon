import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, hasJSXAttribute } from '../../utils/ast'

export const overlayA11y: Rule = {
  meta: {
    id: 'pyreon/overlay-a11y',
    category: 'accessibility',
    description:
      'Warn when <Overlay> declares no a11y intent. `<Overlay>` derives its ARIA internally from the `type` prop (`dialog`/`modal`/`menu`/`tooltip` → `role` + `aria-modal`/`aria-haspopup` on the content container), so `type` satisfies the rule; the check only fires when NONE of `type`/`role`/`aria-label`/`aria-labelledby` is present.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        const name = node.name
        if (!name || name.type !== 'JSXIdentifier' || name.name !== 'Overlay') return

        // `<Overlay type="dialog|modal|menu|tooltip">` is the idiomatic way to
        // give an Overlay its a11y — the component derives `role` + aria state
        // from `type` and applies them to the inner content container (real
        // dialog semantics belong there, not on the wrapper). Treat `type` as
        // satisfying the requirement so the rule stops flagging correct code.
        const hasType = hasJSXAttribute(node, 'type')
        const hasRole = hasJSXAttribute(node, 'role')
        const hasLabel = hasJSXAttribute(node, 'aria-label')
        const hasLabelledBy = hasJSXAttribute(node, 'aria-labelledby')

        if (!hasType && !hasRole && !hasLabel && !hasLabelledBy) {
          context.report({
            message:
              '`<Overlay>` declares no accessibility intent — set `type` ("dialog"/"modal"/"menu"/"tooltip", which derives ARIA automatically) or an explicit `role`/`aria-label`/`aria-labelledby`.',
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
