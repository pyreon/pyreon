import type { Rule, VisitorCallbacks } from '../../types'
import { getJSXAttribute, getSpan } from '../../utils/ast'
import { extractImportInfo } from '../../utils/imports'

const EXTERNAL_PREFIXES = ['http://', 'https://', 'mailto:', 'tel:', '//']

/**
 * A same-origin href that is not a PAGE: an API route (`/api/rss`) or a file
 * (`/feed.xml`, `/report.pdf`). `<Link>` would hand it to the client router,
 * which renders the not-found route instead of letting the browser fetch the
 * resource — so a plain `<a>` is the correct element and must not be flagged.
 */
function isNonPageResource(href: string): boolean {
  const path = href.split(/[?#]/)[0] ?? ''
  if (path === '/api' || path.startsWith('/api/')) return true
  const last = path.slice(path.lastIndexOf('/') + 1)

  return /\.[a-z0-9]{1,5}$/i.test(last) && !/\.html?$/i.test(last)
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

        // Get the href value
        // `download` / `target` mean the author wants the browser, not the
        // router: a file save or a new browsing context.
        if (getJSXAttribute(node, 'download') || getJSXAttribute(node, 'target')) return

        const value = hrefAttr.value
        if (value?.type === 'Literal' && typeof value.value === 'string') {
          const href: string = value.value
          // Skip external URLs and anchor links
          if (href.startsWith('#') || EXTERNAL_PREFIXES.some((p) => href.startsWith(p))) return
          if (isNonPageResource(href)) return
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
