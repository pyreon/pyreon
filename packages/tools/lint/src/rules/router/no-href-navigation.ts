import type { Rule, VisitorCallbacks } from '../../types'
import { getJSXAttribute, getSpan } from '../../utils/ast'
import { extractImportInfo } from '../../utils/imports'

const EXTERNAL_PREFIXES = ['http://', 'https://', 'mailto:', 'tel:']

/**
 * An anchor that says it is NOT an in-app navigation: it opens elsewhere
 * (`target`), saves a file (`download`), or names a resource / an outside
 * page through `rel` (`alternate` — a feed or other representation of the
 * page; `external`). `<RouterLink>` would be wrong for each: the router
 * would try to match `/blog/rss.xml` as a route. Dynamic hrefs make the
 * href itself unreadable, so these explicit signals are what the rule can
 * trust.
 */
const NON_ROUTE_RELS = ['alternate', 'external']

function declaresNonRoute(node: any): boolean {
  if (getJSXAttribute(node, 'target') || getJSXAttribute(node, 'download')) return true
  const rel = getJSXAttribute(node, 'rel')?.value
  if (rel?.type === 'Literal' && typeof rel.value === 'string') {
    const tokens = rel.value.toLowerCase().split(/\s+/)
    return NON_ROUTE_RELS.some((t) => tokens.includes(t))
  }
  return false
}

export const noHrefNavigation: Rule = {
  meta: {
    id: 'pyreon/no-href-navigation',
    category: 'router',
    description:
      'Warn when `<a href>` is used in files that import @pyreon/router — use `<Link>` instead.',
    severity: 'warn',
    fixable: false,
    // The rule cannot tell a CONSUMER of `<Link>` from its IMPLEMENTATION — the
    // file that renders the underlying `<a href>` reports here too.
    schema: { exemptPaths: 'string[]' },
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
        if (declaresNonRoute(node)) return

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
