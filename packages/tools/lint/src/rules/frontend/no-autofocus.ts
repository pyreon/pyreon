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
 * The autofix removes the entire attribute. An attribute alone on its line
 * takes the whole line with it (otherwise the fix leaves a whitespace-only
 * line behind); an inline one takes a single leading space or tab, so no
 * double space is left.
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
        const removalSpan = attributeRemovalSpan(context.getSourceText(), attrSpan)

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

/**
 * The span to delete so the attribute disappears without leaving debris: its
 * whole line (indentation and newline) when nothing else shares that line,
 * otherwise the attribute plus one leading space or tab.
 */
function attributeRemovalSpan(source: string, attr: Span): Span {
  let lineStart = attr.start
  while (lineStart > 0 && (source[lineStart - 1] === ' ' || source[lineStart - 1] === '\t')) {
    lineStart--
  }
  let lineEnd = attr.end
  while (lineEnd < source.length && (source[lineEnd] === ' ' || source[lineEnd] === '\t')) {
    lineEnd++
  }
  const ownLine =
    (lineStart === 0 || source[lineStart - 1] === '\n') &&
    lineEnd < source.length &&
    (source[lineEnd] === '\n' || source[lineEnd] === '\r')
  if (ownLine && lineStart > 0) {
    // Delete from the previous line's newline through the attribute's trailing
    // blanks: the line vanishes and the following newline keeps the layout.
    const nl = source[lineStart - 2] === '\r' ? lineStart - 2 : lineStart - 1
    return { start: nl, end: lineEnd }
  }
  const prevChar = source[attr.start - 1]

  return prevChar === ' ' || prevChar === '\t'
    ? { start: attr.start - 1, end: attr.end }
    : { start: attr.start, end: attr.end }
}
