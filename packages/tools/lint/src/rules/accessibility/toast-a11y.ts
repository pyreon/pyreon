import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, hasJSXAttribute } from '../../utils/ast'

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
    /** Local names that are really `Toaster` from `@pyreon/toast`. */
    const toasterAliases = new Set<string>(['Toaster'])

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        if (node?.source?.value !== '@pyreon/toast') return
        for (const spec of node.specifiers ?? []) {
          if (
            spec.type === 'ImportSpecifier' &&
            spec.imported?.type === 'Identifier' &&
            String(spec.imported.name) === 'Toaster' &&
            spec.local?.type === 'Identifier'
          ) {
            toasterAliases.add(String(spec.local.name))
          }
        }
      },
      JSXOpeningElement(node: any) {
        const name = node.name
        if (!name || name.type !== 'JSXIdentifier') return

        const tagName: string = name.name
        // The shipped `<Toaster>` derives its own live region, so it is exempt
        // — under ANY local name. Matching the literal spelling meant
        // `import { Toaster as AppToast }` was reported for missing a11y it
        // already has, which is a false positive on the library's own component.
        if (toasterAliases.has(tagName)) return
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
