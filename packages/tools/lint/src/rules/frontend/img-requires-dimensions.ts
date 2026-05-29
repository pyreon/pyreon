import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, hasJSXAttribute } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'

/**
 * Opt-in frontend best-practice rule.
 *
 * An `<img>` without intrinsic dimensions causes Cumulative Layout
 * Shift (CLS): the browser reflows the page once the image bytes
 * arrive and it learns the real size. Requiring explicit `width` AND
 * `height` attributes lets the browser reserve the box up front.
 */
export const imgRequiresDimensions: Rule = {
  meta: {
    id: 'pyreon/img-requires-dimensions',
    category: 'frontend',
    description:
      'Require explicit `width` and `height` attributes on `<img>` to reserve layout space and avoid CLS.',
    severity: 'warn',
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

        const hasWidth = hasJSXAttribute(node, 'width')
        const hasHeight = hasJSXAttribute(node, 'height')

        if (!hasWidth || !hasHeight) {
          context.report({
            message:
              '`<img>` is missing explicit `width` and `height` — add both (or an aspect-ratio) to reserve space and avoid layout shift (CLS).',
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
