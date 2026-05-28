// Web implementation of `<Link>` — router-aware navigation link.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { RouterLink } from '@pyreon/router'
import type { LinkProps } from '../types/interaction'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

/**
 * `<Link>` — navigation link.
 *
 * Compiles to:
 * - Web (this impl): `<a href>` — internal links route via
 *   `@pyreon/router`'s `RouterLink` (real client-side navigation, no
 *   full page reload); `external` links are a plain `<a target="_blank">`.
 * - iOS (via PMTC): `NavigationLink(destination: ...)`
 * - Android (via PMTC): `Box(Modifier.clickable { navController.navigate(...) })`
 *
 * ## Internal vs external
 *
 * - **Internal** (`external` falsy): delegates to `RouterLink to={to}`,
 *   which renders an `<a href>` and intercepts the click for SPA
 *   navigation. Requires a `<RouterProvider>` ancestor (the same
 *   requirement as any router hook — without one it throws the
 *   `[Pyreon] No router installed` error). This is the documented
 *   design: the canonical Link is router-aware.
 * - **External** (`external` true): a plain `<a href={to}
 *   target="_blank" rel="noopener noreferrer">` — leaves the SPA, opens
 *   in a new tab, and is safe against reverse-tabnabbing. No router
 *   involvement (external URLs aren't routes).
 *
 * On native targets PMTC intercepts `<Link>` at compile time, so the
 * `@pyreon/router` import here is type-anchor only there.
 */
export const Link = (props: LinkProps): VNode => {
  const passthrough = collectPassthroughAttrs(props as unknown as Record<string, unknown>)

  if (props.external === true) {
    return h(
      'a',
      {
        ...passthrough,
        href: props.to,
        target: '_blank',
        rel: 'noopener noreferrer',
        style: mergePassthroughStyle({}, props.style),
      },
      props.children,
    )
  }

  return h(
    RouterLink,
    {
      ...passthrough,
      to: props.to,
      ...(props.style !== undefined ? { style: props.style } : {}),
    },
    props.children,
  )
}
