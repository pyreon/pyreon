import type { Rule, Span, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * Opt-in frontend best-practice rule (fixable).
 *
 * The `autoFocus` attribute moves keyboard focus to the element the
 * moment it mounts. For screen-reader and keyboard users this is
 * disorienting — focus jumps without an explicit user action, often
 * skipping context they haven't read yet. Manage focus explicitly
 * AFTER a user interaction instead.
 *
 * Fires on the attribute's mere presence, regardless of value:
 *   - `autoFocus`
 *   - `autoFocus={true}`
 *   - `autofocus="true"`
 *
 * The one exception is `autoFocus={false}` (a literal-`false`
 * expression container) — the attribute is explicitly disabled, so
 * there's no a11y problem and nothing to flag.
 *
 * The autofix removes the entire attribute, also consuming the single
 * leading whitespace so no double space is left behind.
 */
export const noAutofocus: Rule = {
  meta: {
    id: 'pyreon/no-autofocus',
    category: 'frontend',
    description:
      'Disallow the autoFocus attribute — it disorients screen-reader and keyboard users by moving focus on load.',
    severity: 'warn',
    // On by DEFAULT: an unambiguous WCAG failure with an ecosystem
    // counterpart in oxlint's `correctness` tier (jsx-a11y/no-autofocus).
    // Shipping it opt-in meant a fresh Pyreon app had no a11y checking at all.
    fixable: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {

    const callbacks: VisitorCallbacks = {
      JSXAttribute(node: any) {
        const attrName = node.name
        if (
          !attrName ||
          attrName.type !== 'JSXIdentifier' ||
          (attrName.name !== 'autoFocus' && attrName.name !== 'autofocus')
        ) {
          return
        }

        // Skip the explicit opt-out shape `autoFocus={false}`.
        const value = node.value
        if (
          value &&
          value.type === 'JSXExpressionContainer' &&
          value.expression &&
          value.expression.type === 'Literal' &&
          value.expression.value === false
        ) {
          return
        }

        const attrSpan = getSpan(node)
        const source = context.getSourceText()
        // Consume a single leading whitespace char so removing the
        // attribute doesn't leave a double space behind.
        const prevChar = source[attrSpan.start - 1]
        const removalSpan: Span =
          prevChar === ' ' || prevChar === '\t'
            ? { start: attrSpan.start - 1, end: attrSpan.end }
            : { start: attrSpan.start, end: attrSpan.end }

        context.report({
          message:
            'Avoid `autoFocus` — moving focus on mount disorients screen-reader and keyboard users. Manage focus explicitly after a user action instead.',
          span: attrSpan,
          fix: { span: removalSpan, replacement: '' },
        })
      },
    }

    return callbacks
  },
}
