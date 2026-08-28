import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, hasJSXAttribute } from '../../utils/ast'

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
    // On by DEFAULT: an unambiguous WCAG failure with an ecosystem
    // counterpart in oxlint's `correctness` tier (jsx-a11y/alt-text).
    // Shipping it opt-in meant a fresh Pyreon app had no a11y checking at all.
    fixable: false,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {

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
