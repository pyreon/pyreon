import { useContext } from '@pyreon/core'
import { RouterContext } from '@pyreon/router'

// The href tests live in a router-free module so islands can use them
// without pulling in the router.
import { isRouterHref } from './href'

export { isExternalHref, isFileHref, isRouterHref } from './href'

/**
 * Client-side navigation for kit links that are styled anchors rather than
 * `<RouterLink>` (rocketstyle renders the `<a>` itself). Mirrors RouterLink's
 * click contract: modifier and non-primary clicks fall through to the browser,
 * external / file hrefs load normally, internal paths go through the router.
 * Call in component setup; returns a click-handler factory.
 */
export function useLinkClick(): (href: string, after?: () => void) => (e: MouseEvent) => void {
  // No router inside an island on a static page: links load normally there.
  const router = useContext(RouterContext)
  return (href, after) => (e) => {
    after?.()
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (router === null || !isRouterHref(href)) return
    e.preventDefault()
    void router.push(href)
  }
}
