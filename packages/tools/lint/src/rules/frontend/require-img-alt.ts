import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, hasJSXAttribute } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'

/**
 * Opt-in frontend best-practice rule.
 *
 * Every `<img>` must carry an `alt` attribute. A missing `alt` is an
 * accessibility failure — screen readers announce the file name or
 * nothing at all. An EMPTY `alt=""` is valid and intentional: it marks
 * the image as decorative so assistive tech skips it. We only check
 * presence, never the value.
 */
export const requireImgAlt: Rule = {
  meta: {
    id: 'pyreon/require-img-alt',
    category: 'frontend',
    description: 'Require an `alt` attribute on every `<img>` element (alt="" is valid for decorative images).',
    severity: 'error',
    fixable: false,
    optIn: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        const name = node.name
        if (!name || name.type !== 'JSXIdentifier' || name.name !== 'img') return

        if (!hasJSXAttribute(node, 'alt')) {
          context.report({
            message:
              '`<img>` is missing an `alt` attribute — add an `alt` describing the image (or `alt=""` if it is purely decorative).',
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
