import { h, mergeProps, splitProps } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { isServer, signal } from '@pyreon/reactivity'

export interface SkipLinkProps {
  /**
   * In-page fragment to skip to (default `'#main'`). Should point at your main
   * landmark, e.g. `<main id="main">`. Activating the link moves both scroll
   * AND keyboard focus there.
   */
  href?: string | (() => string)
  /** Link text (default `'Skip to content'`). */
  children?: VNodeChild
  /**
   * Other props (`class`, `id`, `style`, `on*`, …) are forwarded to the `<a>`.
   * A `style` object merges OVER the built-in reveal/clip styles so you can
   * restyle the focused appearance without losing the hide-until-focus behavior.
   */
  [key: string]: unknown
}

// Hidden-but-present when not focused — the same clip VisuallyHidden uses, so
// the link stays in the DOM + tab order but takes zero layout space.
const CLIPPED: Record<string, string> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: '0',
}

// Revealed at the top-left on focus. Minimal readable defaults (neutral, uses
// currentColor for the border) — override any of it via the `style` prop.
const REVEALED: Record<string, string> = {
  position: 'fixed',
  top: '0.5rem',
  left: '0.5rem',
  zIndex: '10000',
  width: 'auto',
  height: 'auto',
  margin: '0',
  padding: '0.5rem 1rem',
  overflow: 'visible',
  clip: 'auto',
  whiteSpace: 'nowrap',
  background: '#ffffff',
  color: '#111111',
  border: '2px solid currentColor',
  borderRadius: '4px',
  textDecoration: 'underline',
}

/**
 * Move keyboard focus (not just scroll) to the skip target. Returns whether the
 * href was an in-page fragment the link handled itself.
 */
function moveFocusToTarget(href: string): boolean {
  // Only ever called from the click handler (browser-only), but guard for SSR
  // safety so a server bundle never touches `document`.
  if (isServer) return false
  if (!href.startsWith('#')) return false
  const target = document.getElementById(href.slice(1))
  if (!target) return true
  // A non-interactive landmark (e.g. <main>) isn't natively focusable, so give
  // it a programmatic-focus tabindex first. Focus WITHOUT scrolling, then
  // scroll explicitly — we no longer rely on the default hash navigation to
  // bring it into view (see the click handler).
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: true })
  target.scrollIntoView?.()
  return true
}

/**
 * A keyboard "skip to content" link — the first focusable element on the page,
 * hidden until focused, that lets keyboard and screen-reader users jump past
 * repeated navigation straight to the main content (WCAG 2.4.1 Bypass Blocks).
 *
 * Render it as the very first child of `<body>` / the app root. It's clipped
 * out of view until it receives focus (first Tab), then appears at the top-left;
 * activating it moves scroll AND focus to the target landmark.
 *
 * @example
 * ```tsx
 * <body>
 *   <SkipLink href="#main">Skip to content</SkipLink>
 *   <nav>…</nav>
 *   <main id="main">…</main>
 * </body>
 * ```
 */
export function SkipLink(props: SkipLinkProps): VNodeChild {
  // splitProps rather than a destructure, so a signal-driven `href` / `class` /
  // `style` is not frozen at its first value (a destructure fires every
  // compiler-emitted getter once, at setup).
  const [own, rest] = splitProps(
    props as SkipLinkProps & {
      style?: Record<string, string> | (() => Record<string, string>)
      onFocus?: (e: FocusEvent) => void
      onBlur?: (e: FocusEvent) => void
      onClick?: (e: MouseEvent) => void
    },
    ['href', 'children', 'style', 'onFocus', 'onBlur', 'onClick'],
  )

  const focused = signal(false)
  const href = (): string => {
    const value = own.href
    return (typeof value === 'function' ? value() : value) ?? '#main'
  }

  return h(
    'a',
    mergeProps(rest, {
      href,
      // Reactive: clipped until focused, revealed on focus. Caller style wins.
      style: () => {
        const raw = own.style
        const user = typeof raw === 'function' ? raw() : raw
        return { ...(focused() ? REVEALED : CLIPPED), ...(user && typeof user === 'object' ? user : undefined) }
      },
      onFocus: (e: FocusEvent) => {
        focused.set(true)
        own.onFocus?.(e)
      },
      onBlur: (e: FocusEvent) => {
        focused.set(false)
        own.onBlur?.(e)
      },
      onClick: (e: MouseEvent) => {
        // Handle the fragment ourselves and CANCEL the default navigation.
        // Letting the browser follow `#main` breaks under a hash-mode router,
        // which reads the new hash as the route "main" and navigates away
        // from the page the user was trying to skip INTO.
        if (moveFocusToTarget(href())) e.preventDefault()
        own.onClick?.(e)
      },
    }),
    own.children ?? 'Skip to content',
  )
}
