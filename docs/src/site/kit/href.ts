/** A URL with a scheme (`https:`, `mailto:`) or protocol-relative: leaves the app. */
export const isExternalHref = (href: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')

/** A same-site file the router does not serve (feeds, txt): needs a full load. */
export const isFileHref = (href: string): boolean => /\.(xml|txt|json|svg|png|pdf)$/i.test(href)

/** True when the router should handle a click on this href. */
export const isRouterHref = (href: string): boolean =>
  href.startsWith('/') && !href.startsWith('//') && !isFileHref(href)
