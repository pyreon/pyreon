// Interaction primitive type definitions — Button / Press / Link.

import type { ChildrenProp } from './shared'

/**
 * `<Button>` — styled call-to-action button. Picks up platform-native
 * button chrome.
 *
 * Per-platform mapping:
 * - Web: `<button>` with default styling
 * - iOS: `Button(action: ...) { ... }`
 * - Android: `Button(onClick = ...) { ... }`
 */
export interface ButtonProps extends ChildrenProp {
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
export interface PressProps extends ChildrenProp {
  onPress: () => void
  onLongPress?: () => void
  disabled?: boolean
}

/**
 * `<Link>` — router-aware navigation link. Pulls router context to
 * resolve the navigation target. On web emits as `<a>` with proper
 * href; on iOS/Android invokes the platform-native navigation API.
 *
 * Per-platform mapping:
 * - Web: `<a href=...>` via `@pyreon/router` `RouterLink`
 * - iOS: `NavigationLink(destination: ...)`
 * - Android: `Box(modifier=Modifier.clickable { navController.navigate(...) })`
 */
export interface LinkProps extends ChildrenProp {
  to: string
  /** Equivalent to `<a target="_blank">` on web; opens in external app on native. */
  external?: boolean
}
