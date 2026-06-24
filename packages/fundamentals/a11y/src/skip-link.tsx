import { h } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { isServer, signal } from '@pyreon/reactivity'

export interface SkipLinkProps {
  /**
   * In-page fragment to skip to (default `'#main'`). Should point at your main
   * landmark, e.g. `<main id="main">`. Activating the link moves both scroll
   * AND keyboard focus there.
   */
  href?: string
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

/** Move keyboard focus (not just scroll) to the skip target. */
function moveFocusToTarget(href: string): void {
  // Only ever called from the click handler (browser-only), but guard for SSR
  // safety so a server bundle never touches `document`.
  if (isServer) return
  if (!href.startsWith('#')) return
  const target = document.getElementById(href.slice(1))
  if (!target) return
  // The default hash navigation scrolls the target into view; we ALSO move
  // focus there so the next Tab continues from the main content — the whole
  // point of a skip link. A non-interactive landmark (e.g. <main>) isn't
  // natively focusable, so give it a programmatic-focus tabindex first.
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus()
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
  const {
    href = '#main',
    children = 'Skip to content',
    style: userStyle,
    onFocus,
    onBlur,
    onClick,
    ...rest
  } = props as SkipLinkProps & {
    style?: Record<string, string>
    onFocus?: (e: FocusEvent) => void
    onBlur?: (e: FocusEvent) => void
    onClick?: (e: MouseEvent) => void
  }

  const focused = signal(false)
  const override = userStyle && typeof userStyle === 'object' ? userStyle : undefined

  return h(
    'a',
    {
      ...rest,
      href,
      // Reactive: clipped until focused, revealed on focus. Caller style wins.
      style: () => ({ ...(focused() ? REVEALED : CLIPPED), ...override }),
      onFocus: (e: FocusEvent) => {
        focused.set(true)
        onFocus?.(e)
      },
      onBlur: (e: FocusEvent) => {
        focused.set(false)
        onBlur?.(e)
      },
      onClick: (e: MouseEvent) => {
        moveFocusToTarget(href)
        onClick?.(e)
      },
    },
    children,
  )
}
