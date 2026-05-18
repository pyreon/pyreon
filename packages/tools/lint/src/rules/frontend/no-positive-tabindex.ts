import type { Rule, Span, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'

/**
 * Opt-in frontend best-practice rule (fixable).
 *
 * A positive `tabIndex` (1, 2, …) pulls the element to the FRONT of the
 * keyboard tab order, ahead of every natural-order element on the page.
 * This almost always produces a confusing, unmaintainable focus
 * sequence. Use `0` (focusable, in natural DOM order) or `-1`
 * (focusable only programmatically). The autofix rewrites the value to
 * `0`.
 *
 * Handles both shapes:
 *   - `tabIndex={3}`   → JSXExpressionContainer → Literal (number)
 *   - `tabindex="3"`   → Literal (string)
 */
export const noPositiveTabindex: Rule = {
  meta: {
    id: 'pyreon/no-positive-tabindex',
    category: 'frontend',
    description: 'Disallow a positive `tabIndex` — it breaks natural keyboard focus order. Use 0 or -1.',
    severity: 'warn',
    fixable: true,
    optIn: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    const callbacks: VisitorCallbacks = {
      JSXAttribute(node: any) {
        const attrName = node.name
        if (
          !attrName ||
          attrName.type !== 'JSXIdentifier' ||
          (attrName.name !== 'tabIndex' && attrName.name !== 'tabindex')
        ) {
          return
        }

        const value = node.value
        if (!value) return

        // `tabindex="3"` — direct string literal.
        if (value.type === 'Literal' && typeof value.value === 'string') {
          const parsed = Number(value.value.trim())
          if (Number.isInteger(parsed) && parsed > 0) {
            report(getSpan(value), '"0"')
          }
          return
        }

        // `tabIndex={3}` — expression container wrapping a numeric literal.
        if (value.type === 'JSXExpressionContainer') {
          const expr = value.expression
          if (
            expr &&
            expr.type === 'Literal' &&
            typeof expr.value === 'number' &&
            Number.isInteger(expr.value) &&
            expr.value > 0
          ) {
            report(getSpan(expr), '0')
          }
        }
      },
    }

    function report(valueSpan: Span, replacement: string): void {
      context.report({
        message:
          'Positive `tabIndex` breaks natural focus order — use `0` (focusable in DOM order) or `-1` (programmatic only).',
        span: valueSpan,
        fix: { span: valueSpan, replacement },
      })
    }

    return callbacks
  },
}
