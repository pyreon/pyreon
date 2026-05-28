// Interaction primitive type definitions — Button / Press / Link.

import type { ChildrenProp, HtmlPassthroughProps } from './shared'

/**
 * `<Button>` — styled call-to-action button. Picks up platform-native
 * button chrome.
 *
 * Per-platform mapping:
 * - Web: `<button>` with default styling
 * - iOS: `Button(action: ...) { ... }`
 * - Android: `Button(onClick = ...) { ... }`
 */
export interface ButtonProps extends ChildrenProp, HtmlPassthroughProps {
  onPress: () => void
  disabled?: boolean
  /** Button visual variant. Default `primary`. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}

/**
 * `<Press>` — un-styled press wrapper. Use for custom-chromed
 * interactive elements (a clickable card, an icon-only button).
 * Children render as-is; press behavior is overlaid.
 *
 * Per-platform mapping:
 * - Web: `<div role="button" onClick=...>` (with focusable + keyboard support)
 * - iOS: `Button { ... }` no chrome
 * - Android: `Box(modifier=Modifier.clickable(onClick=...))`
 */
export interface PressProps extends ChildrenProp, HtmlPassthroughProps {
  onPress: () => void
  onLongPress?: () => void
  disabled?: boolean
}

/**
 * `<Link>` — navigation link. Router-AGNOSTIC: the web runtime has no
 * router dependency. The app wires client-side navigation once via
 * `init({ navigate })`; internal links then intercept clicks for SPA
 * navigation (and are a plain full-load `<a href>` otherwise). On
 * iOS/Android, PMTC emits the platform-native navigation API.
 *
 * Per-platform mapping:
 * - Web: `<a href=...>` + SPA-nav click interception when `init({ navigate })`
 *   is configured (see `@pyreon/primitives` `init`)
 * - iOS: `NavigationLink(destination: ...)`
 * - Android: `Box(modifier=Modifier.clickable { navController.navigate(...) })`
 */
export interface LinkProps extends ChildrenProp, HtmlPassthroughProps {
  to: string
  /** Equivalent to `<a target="_blank">` on web; opens in external app on native. */
  external?: boolean
}
