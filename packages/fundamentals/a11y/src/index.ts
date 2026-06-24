/**
 * @pyreon/a11y — accessibility primitives for Pyreon.
 *
 * Zero-setup building blocks for accessible UIs:
 *
 * - `announce(message)` — speak a message to screen readers via an
 *   `aria-live` region. No provider, no component to mount.
 * - `<VisuallyHidden>` — content that's invisible on screen but available to
 *   assistive technology.
 * - `<SkipLink>` — keyboard "skip to content" link (hidden until focused) that
 *   moves focus past repeated nav to the main landmark (WCAG 2.4.1).
 * - `createA11yId(prefix?)` — stable, SSR-safe id for ARIA relationships
 *   (`aria-labelledby` / `aria-describedby` / `for`).
 *
 * @example
 * ```tsx
 * import { announce, VisuallyHidden, createA11yId } from '@pyreon/a11y'
 *
 * announce('Item added to cart')
 *
 * <button>
 *   <CartIcon />
 *   <VisuallyHidden>Add to cart</VisuallyHidden>
 * </button>
 * ```
 *
 * @packageDocumentation
 */
import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Duplicate-instance sentinel — see @pyreon/reactivity registerSingleton for
// the full rationale. Name + version are derived from package.json (never
// hardcoded) so a release bump can't drift the diagnostic version.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

export { announce, clearAnnouncements } from './announce'
export type { A11yPoliteness, AnnounceOptions } from './announce'
export { VisuallyHidden } from './visually-hidden'
export type { VisuallyHiddenProps } from './visually-hidden'
export { SkipLink } from './skip-link'
export type { SkipLinkProps } from './skip-link'
export { createA11yId } from './id'
