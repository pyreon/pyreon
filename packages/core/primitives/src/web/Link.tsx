// Web implementation of `<Link>` — navigation link (router-agnostic).

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { getNavigate } from '../config'
import type { LinkProps } from '../types/interaction'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

/**
 * `<Link>` — navigation link. **Router-agnostic**: this package has no
 * router dependency. Internal links do client-side (SPA) navigation
 * only when the app has wired a handler via `init({ navigate })`;
 * otherwise they're a plain full-load `<a href>` — so links always
 * work, the config only upgrades them.
 *
 * Compiles to:
 * - Web (this impl): `<a href>` (+ SPA-nav click interception when
 *   `init({ navigate })` is configured)
 * - iOS (via PMTC): `NavigationLink(destination: ...)`
 * - Android (via PMTC): `Box(Modifier.clickable { navController.navigate(...) })`
 *
 * ## Internal vs external
 *
 * - **Internal** (`external` falsy): `<a href={to}>` — a real,
 *   right-clickable, SEO-visible, no-JS-navigable URL. On a plain
 *   left-click, if `init({ navigate })` configured a handler, the click
 *   is intercepted (`preventDefault`) and routed via `navigate(to)`.
 *   Modifier-clicks (⌘/Ctrl/Shift/Alt) and non-left-clicks are left to
 *   the browser so "open in new tab/window" keeps working.
 * - **External** (`external` true): `<a href={to} target="_blank"
 *   rel="noopener noreferrer">` — leaves the app, new tab, safe against
 *   reverse-tabnabbing. Never intercepted.
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

  const onClick = (e: MouseEvent): void => {
    const navigate = getNavigate()
    // No app-configured navigation → let the browser do a normal nav.
    if (navigate === undefined) return
    // Respect the browser's open-in-new-tab/window affordances and any
    // upstream handler that already handled the event.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return
    }
    e.preventDefault()
    navigate(props.to)
  }

  return h(
    'a',
    {
      ...passthrough,
      href: props.to,
      onClick,
      style: mergePassthroughStyle({}, props.style),
    },
    props.children,
  )
}
