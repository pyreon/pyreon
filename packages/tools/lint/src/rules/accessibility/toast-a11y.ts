import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, hasJSXAttribute } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'

export const toastA11y: Rule = {
  meta: {
    id: 'pyreon/toast-a11y',
    category: 'accessibility',
    description: 'Warn when toast-like components are missing role or aria-live attributes.',
    severity: 'warn',
    fixable: false,
    // The rule inspects the CALL SITE, so a toast row that owns its own ARIA in
    // its DEFINITION (computing `role` from severity, say) still reports here.
    // Resolving that needs the parent chain, and oxc's visitor passes none — so
    // a toast IMPLEMENTATION opts out by path rather than by a silently-inert
    // parent walk. See `.claude/rules/anti-patterns.md` → oxc visitor parent.
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    if (isPathExempt(context)) return {}

    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        const name = node.name
        if (!name || name.type !== 'JSXIdentifier') return

        const tagName: string = name.name
        // Skip non-PascalCase and the Toaster container itself
        if (tagName === 'Toaster') return
        const firstChar = tagName[0]
        if (!firstChar || firstChar !== firstChar.toUpperCase()) return
        if (!tagName.toLowerCase().includes('toast')) return

        const hasRole = hasJSXAttribute(node, 'role')
        const hasAriaLive = hasJSXAttribute(node, 'aria-live')

        if (!hasRole && !hasAriaLive) {
          context.report({
            message: `Toast component \`<${tagName}>\` missing \`role\` or \`aria-live\` — add \`role="alert"\` and \`aria-live="polite"\` for screen reader accessibility.`,
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
