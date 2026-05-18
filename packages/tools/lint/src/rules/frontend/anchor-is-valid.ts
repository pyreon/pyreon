import type { Rule, VisitorCallbacks } from '../../types'
import { getJSXAttribute, getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'

/**
 * Opt-in frontend best-practice rule (not fixable).
 *
 * An `<a>` element is only a real link when it has a valid `href`
 * pointing at a destination. Anchors that are missing `href`, or whose
 * `href` is `""`, `"#"`, or a `javascript:` URL, are not navigable
 * links — they are usually action buttons hiding behind an anchor.
 * That breaks keyboard / screen-reader semantics and middle-click /
 * open-in-new-tab. Use a `<button>` for actions, or give the anchor a
 * real destination URL.
 *
 * Conservative on dynamic values: `href={expr}` is left alone because
 * the runtime value can't be proven statically.
 *
 * Not fixable — the correct rewrite is ambiguous (could be a `<button>`
 * or a real link), so the intent has to come from the author.
 */
export const anchorIsValid: Rule = {
  meta: {
    id: 'pyreon/anchor-is-valid',
    category: 'frontend',
    description:
      'Disallow <a> elements that are not valid links (missing href, or href is "", "#", or javascript:).',
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
        // Only the lowercase intrinsic `a` tag — skip components
        // (uppercase / member expressions) and every other tag.
        if (!name || name.type !== 'JSXIdentifier' || name.name !== 'a') return

        const hrefAttr = getJSXAttribute(node, 'href')

        // No `href` attribute at all → not a link.
        if (!hrefAttr) {
          context.report({
            message:
              'Anchor without `href` is not a link — use a <button> for actions, or add a real href.',
            span: getSpan(name),
          })
          return
        }

        const value = hrefAttr.value
        if (!value) return

        // `href={dynamic}` — can't prove the runtime value, stay quiet.
        if (value.type === 'JSXExpressionContainer') return

        // Static string literal `href="..."`.
        if (value.type === 'Literal' && typeof value.value === 'string') {
          const trimmed = value.value.trim()
          const isInvalid =
            trimmed === '' ||
            trimmed === '#' ||
            trimmed.toLowerCase().startsWith('javascript:')
          if (isInvalid) {
            context.report({
              message: `Invalid anchor href "${value.value}" — use a <button> for actions, or a real destination URL.`,
              span: getSpan(name),
            })
          }
        }
      },
    }

    return callbacks
  },
}
