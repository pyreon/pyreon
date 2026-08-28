import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * `<a target="_blank">` without `rel="noopener noreferrer"`.
 *
 * Two distinct problems, and only one of them is fixed by modern browsers:
 *
 *  - **Reverse tabnabbing.** The opened page gets `window.opener` and can
 *    navigate the tab it came from to a phishing copy of your site. Current
 *    browsers imply `noopener` for `target="_blank"`, so this half is largely
 *    historical — which is why this rule is a `warn`, not an `error`.
 *  - **Referrer leakage.** `noreferrer` is NOT implied by anything. Without
 *    it the destination receives the full URL of the page that linked to it,
 *    including any path segments that identify a user, a document, or a
 *    tenant. This half is live in every browser today.
 *
 * Deliberately conservative to guarantee zero false positives: it fires only
 * when BOTH attributes are static string literals it can read. A dynamic
 * `rel={x}` might well be correct, and a rule that cannot prove otherwise
 * must stay quiet — a security rule that cries wolf is a security rule people
 * turn off.
 */

/** Elements where `target` opens a browsing context. */
const TARGETED_TAGS = new Set(['a', 'area', 'form'])

function attrByName(opening: any, name: string): any | null {
  for (const attr of opening?.attributes ?? []) {
    if (
      attr.type === 'JSXAttribute' &&
      attr.name?.type === 'JSXIdentifier' &&
      attr.name.name === name
    ) {
      return attr
    }
  }
  return null
}

/** The literal string value of an attribute, or null when not statically known. */
function literalValue(attr: any): string | null {
  const v = attr?.value
  if (!v) return null
  if (v.type === 'Literal' && typeof v.value === 'string') return v.value
  // `x={"_blank"}` — a literal wrapped in an expression container.
  if (
    v.type === 'JSXExpressionContainer' &&
    v.expression?.type === 'Literal' &&
    typeof v.expression.value === 'string'
  ) {
    return v.expression.value
  }
  return null
}

export const noTargetBlankWithoutRel: Rule = {
  meta: {
    id: 'pyreon/no-target-blank-without-rel',
    category: 'security',
    description:
      'Require `rel="noopener noreferrer"` on `target="_blank"` — without `noreferrer` the destination receives the full referring URL, and in older browsers the opened page can navigate its opener.',
    severity: 'warn',
    fixable: true,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        const name = node.name
        if (!name || name.type !== 'JSXIdentifier') return
        if (!TARGETED_TAGS.has(name.name)) return

        const targetAttr = attrByName(node, 'target')
        if (!targetAttr) return
        // A dynamic target may or may not be `_blank`; do not guess.
        if (literalValue(targetAttr)?.trim() !== '_blank') return

        const relAttr = attrByName(node, 'rel')
        if (relAttr) {
          const rel = literalValue(relAttr)
          // Dynamic rel — unprovable, so stay silent rather than nag.
          if (rel === null) return
          const tokens = rel.toLowerCase().split(/\s+/)
          if (tokens.includes('noreferrer')) return
          // `noopener` alone still leaks the referrer; keep reporting, but the
          // message below names what is actually missing.
        }

        const targetSpan = getSpan(targetAttr)
        context.report({
          message:
            'External `target="_blank"` without `rel="noreferrer"` — the destination receives the full URL of this page as its referrer (which can identify a user, document or tenant), and older browsers also let it navigate the tab it was opened from. Add `rel="noopener noreferrer"`.',
          span: targetSpan,
          // Insert after the `target` attribute rather than replacing it, so a
          // partially-correct `rel="noopener"` is left for the author to widen
          // — silently rewriting someone's existing rel is worse than a nag.
          ...(relAttr
            ? {}
            : {
                fix: {
                  span: { start: targetSpan.end, end: targetSpan.end },
                  replacement: ' rel="noopener noreferrer"',
                },
              }),
        })
      },
    }
    return callbacks
  },
}
