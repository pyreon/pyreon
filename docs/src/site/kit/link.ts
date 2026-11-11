import { useRouter } from '@pyreon/router'

/** A URL with a scheme (`https:`, `mailto:`) or protocol-relative: leaves the app. */
export const isExternalHref = (href: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')

/** A same-site file the router does not serve (feeds, txt): needs a full load. */
export const isFileHref = (href: string): boolean => /\.(xml|txt|json|svg|png|pdf)$/i.test(href)

/** True when the router should handle a click on this href. */
export const isRouterHref = (href: string): boolean =>
  href.startsWith('/') && !href.startsWith('//') && !isFileHref(href)

/**
 * Client-side navigation for kit links that are styled anchors rather than
 * `<RouterLink>` (rocketstyle renders the `<a>` itself). Mirrors RouterLink's
 * click contract: modifier and non-primary clicks fall through to the browser,
 * external / file hrefs load normally, internal paths go through the router.
 * Call in component setup; returns a click-handler factory.
 */
export function useLinkClick(): (href: string, after?: () => void) => (e: MouseEvent) => void {
  const router = useRouter()
  return (href, after) => (e) => {
    after?.()
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (!isRouterHref(href)) return
    e.preventDefault()
    void router.push(href)
  }
}
