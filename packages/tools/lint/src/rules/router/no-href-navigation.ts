import type { Rule, VisitorCallbacks } from '../../types'
import { getJSXAttribute, getSpan } from '../../utils/ast'
import { extractImportInfo } from '../../utils/imports'

const EXTERNAL_PREFIXES = ['http://', 'https://', 'mailto:', 'tel:']

export const noHrefNavigation: Rule = {
  meta: {
    id: 'pyreon/no-href-navigation',
    category: 'router',
    description:
      'Warn when `<a href>` is used in files that import @pyreon/router — use `<Link>` instead.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    let importsRouter = false

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const info = extractImportInfo(node)
        if (info && info.source === '@pyreon/router') {
          importsRouter = true
        }
      },
      JSXOpeningElement(node: any) {
        if (!importsRouter) return
        const name = node.name
        if (!name || name.type !== 'JSXIdentifier' || name.name !== 'a') return

        const hrefAttr = getJSXAttribute(node, 'href')
        if (!hrefAttr) return

        // Get the href value
        const value = hrefAttr.value
        if (value?.type === 'Literal' && typeof value.value === 'string') {
          const href: string = value.value
          // Skip external URLs and anchor links
          if (href.startsWith('#') || EXTERNAL_PREFIXES.some((p) => href.startsWith(p))) return
        }

        context.report({
          message:
            '`<a href>` in a router file — use `<Link>` or `<RouterLink>` for client-side navigation.',
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
