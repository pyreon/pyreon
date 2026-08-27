import type { Rule, Span, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'

/**
 * Opt-in frontend best-practice rule (fixable).
 *
 * An explicit ARIA `role` that duplicates the element's implicit role
 * is pure noise — it adds bytes, invites drift (someone changes the
 * tag but not the role), and signals a misunderstanding of the ARIA
 * model ("first rule of ARIA: don't use ARIA when native HTML does
 * the job"). The autofix removes the redundant attribute.
 *
 * The implicit-role map below is deliberately CONSERVATIVE — it only
 * contains element→role pairs that hold UNCONDITIONALLY for a
 * lowercase intrinsic tag (no dependence on nesting context or other
 * attributes). The one attribute-conditional case kept is `<a>`,
 * whose implicit `link` role exists ONLY when a static `href`
 * attribute is present (a bare `<a>` is not a link). Tags whose
 * implicit role depends on nesting (`header`/`footer`), an accessible
 * name (`section`/`form`), or other attributes (`select`/`img`) are
 * intentionally excluded to guarantee zero false positives.
 *
 * Dynamic role values (`role={x}`) are skipped — only a static string
 * literal can be proven redundant.
 */

/** Conservative, unconditional element → implicit-ARIA-role map. */
const IMPLICIT_ROLE: Readonly<Record<string, string>> = {
  button: 'button',
  nav: 'navigation',
  ul: 'list',
  ol: 'list',
  li: 'listitem',
  table: 'table',
  tr: 'row',
  td: 'cell',
  th: 'columnheader',
  thead: 'rowgroup',
  tbody: 'rowgroup',
  tfoot: 'rowgroup',
  article: 'article',
  aside: 'complementary',
  main: 'main',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  dialog: 'dialog',
}

/**
 * Find an attribute by NAME. Says nothing about its value being static —
 * `getStaticStringAttr` is the one that proves that.
 */
function getAttr(openingElement: any, attrName: string): any | null {
  const attrs = openingElement?.attributes ?? []
  for (const attr of attrs) {
    if (
      attr.type === 'JSXAttribute' &&
      attr.name?.type === 'JSXIdentifier' &&
      attr.name.name === attrName
    ) {
      return attr
    }
  }
  return null
}

/**
 * Find an attribute whose value is a literal STRING — i.e. one whose presence
 * at runtime is provable from the source.
 *
 * This distinction is load-bearing for `<a>`. A dynamic `href={x}` may resolve
 * to `undefined`, and Pyreon's `applyProp` REMOVES a nullish attribute — so
 * the element renders with no `href`, has no implicit `link` role, and an
 * explicit `role="link"` on it is meaningful rather than redundant. Treating
 * the mere presence of an `href` attribute as proof produced exactly that
 * false positive.
 */
function getStaticStringAttr(openingElement: any, attrName: string): any | null {
  const attr = getAttr(openingElement, attrName)
  const value = attr?.value
  if (!value || value.type !== 'Literal' || typeof value.value !== 'string') return null
  return attr
}

export const noRedundantRole: Rule = {
  meta: {
    id: 'pyreon/no-redundant-role',
    category: 'frontend',
    description: 'Disallow an ARIA role that duplicates the element’s implicit role.',
    severity: 'warn',
    // On by DEFAULT: an unambiguous WCAG failure with an ecosystem
    // counterpart in oxlint's `correctness` tier (jsx-a11y/no-redundant-roles).
    // Shipping it opt-in meant a fresh Pyreon app had no a11y checking at all.
    fixable: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    const callbacks: VisitorCallbacks = {
      JSXElement(node: any) {
        const opening = node.openingElement
        if (!opening) return

        const nameNode = opening.name
        if (!nameNode || nameNode.type !== 'JSXIdentifier') return

        const tag = nameNode.name
        // Only handle lowercase intrinsic tags — uppercase = component.
        if (!tag || tag[0] !== tag[0]?.toLowerCase()) return

        let implicitRole = IMPLICIT_ROLE[tag]

        // `<a>` only has an implicit `link` role when a static `href`
        // attribute is present.
        if (tag === 'a') {
          if (getStaticStringAttr(opening, 'href')) {
            implicitRole = 'link'
          } else {
            return
          }
        }

        if (!implicitRole) return

        const roleAttr = getAttr(opening, 'role')
        if (!roleAttr) return

        const value = roleAttr.value
        // Conservative: only a direct string literal can be proven
        // redundant. Skip JSXExpressionContainer / dynamic values.
        if (!value || value.type !== 'Literal' || typeof value.value !== 'string') {
          return
        }

        const roleValue = value.value.trim().toLowerCase()
        if (roleValue !== implicitRole) return

        const attrSpan = getSpan(roleAttr)
        const source = context.getSourceText()
        // Consume a single leading whitespace char so removing the
        // attribute doesn't leave a double space behind.
        const prevChar = source[attrSpan.start - 1]
        const removalSpan: Span =
          prevChar === ' ' || prevChar === '\t'
            ? { start: attrSpan.start - 1, end: attrSpan.end }
            : { start: attrSpan.start, end: attrSpan.end }

        context.report({
          message: `Redundant role="${implicitRole}" — ${tag} already has the implicit ARIA role "${implicitRole}". Remove it.`,
          span: attrSpan,
          fix: { span: removalSpan, replacement: '' },
        })
      },
    }

    return callbacks
  },
}
