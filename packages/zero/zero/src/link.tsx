import { createRef } from '@pyreon/core'
import { useRouter } from '@pyreon/router'
import { useIntersectionObserver } from './utils/use-intersection-observer'

// ─── Link component with prefetching ────────────────────────────────────────
//
// Provides client-side navigation, prefetching, and active state tracking.
// Three levels of API:
//
// 1. useLink(props)   — composable returning handlers, state, and ref callback
// 2. createLink(Comp) — HOC wrapping any component with link behavior
// 3. Link             — default <a>-based link (built on createLink)

export interface LinkProps {
  /** Target URL path. */
  href: string
  /** Link content. */
  children?: any
  /** CSS class name. */
  class?: string
  /** Class applied when this link matches the current route. */
  activeClass?: string
  /** Class applied when this link exactly matches the current route. */
  exactActiveClass?: string
  /** Prefetch strategy. Default: "hover" */
  prefetch?: 'hover' | 'viewport' | 'none'
  /** Open in new tab. */
  external?: boolean
  /** Inline styles. */
  style?: string
  /** ARIA label. */
  'aria-label'?: string
  /** Additional click handler — called before navigation. Call e.preventDefault() to cancel. */
  onClick?: ((e: MouseEvent) => void) | undefined
}

/** Props passed to a custom component via createLink. */
export interface LinkRenderProps {
  href: string
  ref: import('@pyreon/core').Ref<HTMLAnchorElement>
  onClick: (e: MouseEvent) => void
  onMouseEnter: () => void
  onTouchStart: () => void
  isActive: () => boolean
  isExactActive: () => boolean
  /** Reactive class string — pass directly to element for auto-updates on route change. */
  class: (() => string) | string | undefined
  style?: string
  target?: string
  rel?: string
  'aria-label'?: string
  children?: any
}

/** Return type of useLink. */
export interface UseLinkReturn {
  /** Ref object — attach to the root element for viewport-based prefetch. */
  ref: import('@pyreon/core').Ref<HTMLAnchorElement>
  /** Click handler — performs client-side navigation. */
  handleClick: (e: MouseEvent) => void
  /** Mouse enter handler — triggers hover prefetch. */
  handleMouseEnter: () => void
  /** Touch start handler — triggers prefetch on mobile. */
  handleTouchStart: () => void
  /** Whether the link partially matches the current route. */
  isActive: () => boolean
  /** Whether the link exactly matches the current route. */
  isExactActive: () => boolean
  /** Resolved class string including active classes. */
  classes: () => string
}

const MAX_PREFETCH_CACHE = 200
const prefetched = new Set<string>()

function doPrefetch(href: string) {
  if (prefetched.has(href)) return
  // Evict oldest entries when cache is full
  if (prefetched.size >= MAX_PREFETCH_CACHE) {
    const first = prefetched.values().next().value
    if (first) prefetched.delete(first)
  }
  prefetched.add(href)

  const docLink = document.createElement('link')
  docLink.rel = 'prefetch'
  docLink.href = href
  docLink.as = 'document'
  document.head.appendChild(docLink)

  try {
    const chunkHint = document.createElement('link')
    chunkHint.rel = 'modulepreload'
    chunkHint.href = href
    document.head.appendChild(chunkHint)
  } catch {
    // modulepreload is a hint, not critical
  }
}

/**
 * Prefetch a route's JS chunk by injecting `<link rel="prefetch">` into the
 * document head. Deduplicates — calling with the same href twice is a no-op.
 *
 * @example
 * prefetchRoute('/about')
 * prefetchRoute('/dashboard')
 */
export function prefetchRoute(href: string): void {
  doPrefetch(href)
}

/**
 * Composable that provides all link behavior — navigation, prefetching,
 * active state, and viewport observation.
 *
 * Use this for full control when `createLink` is too opinionated.
 *
 * @example
 * function MyLink(props: LinkProps) {
 *   const link = useLink(props)
 *   return (
 *     <button ref={link.ref} class={link.classes()} onClick={link.handleClick}>
 *       {props.children}
 *     </button>
 *   )
 * }
 */
export function useLink(props: LinkProps): UseLinkReturn {
  const router = useRouter()
  const elementRef = createRef<HTMLAnchorElement>()
  const strategy = props.prefetch ?? 'hover'

  function handleClick(e: MouseEvent) {
    // Call user's onClick first — they may call e.preventDefault()
    if (props.onClick) {
      ;(props.onClick as (e: MouseEvent) => void)(e)
    }

    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      props.external
    ) {
      return
    }
    e.preventDefault()
    router.push(props.href)
  }

  function handleMouseEnter() {
    if (strategy === 'hover') {
      doPrefetch(props.href)
    }
  }

  function handleTouchStart() {
    if (strategy === 'hover' || strategy === 'viewport') {
      doPrefetch(props.href)
    }
  }

  if (strategy === 'viewport') {
    useIntersectionObserver(
      () => elementRef.current ?? undefined,
      () => doPrefetch(props.href),
    )
  }

  const isActive = () => {
    const currentPath = router.currentRoute()?.path
    if (!currentPath || !props.href) return false
    if (props.href === '/') return currentPath === '/'
    return currentPath.startsWith(props.href)
  }

  const isExactActive = () => {
    const currentPath = router.currentRoute()?.path
    if (!currentPath) return false
    return currentPath === props.href
  }

  const classes = () => {
    const cls: string[] = []
    if (props.class) cls.push(props.class)
    if (props.activeClass && isActive()) cls.push(props.activeClass)
    if (props.exactActiveClass && isExactActive()) cls.push(props.exactActiveClass)
    return cls.join(' ')
  }

  return {
    ref: elementRef,
    handleClick,
    handleMouseEnter,
    handleTouchStart,
    isActive,
    isExactActive,
    classes,
  }
}

/**
 * Higher-order component that wraps any component with link behavior.
 *
 * The wrapped component receives {@link LinkRenderProps} with all handlers,
 * active state, and accessibility attributes pre-wired.
 *
 * @example
 * // Custom button link
 * const ButtonLink = createLink((props) => (
 *   <button
 *     ref={props.ref}
 *     class={props.class}
 *     onClick={props.onClick}
 *     onMouseEnter={props.onMouseEnter}
 *   >
 *     {props.children}
 *   </button>
 * ))
 *
 * // Custom styled component
 * const CardLink = createLink((props) => (
 *   <div
 *     ref={props.ref}
 *     class={`card ${props.isActive() ? "card--active" : ""}`}
 *     onClick={props.onClick}
 *     onMouseEnter={props.onMouseEnter}
 *   >
 *     {props.children}
 *   </div>
 * ))
 *
 * // Usage
 * <ButtonLink href="/about">About</ButtonLink>
 * <CardLink href="/posts" prefetch="viewport">Posts</CardLink>
 */
export function createLink(Component: (props: LinkRenderProps) => any): (props: LinkProps) => any {
  return function WrappedLink(props: LinkProps) {
    const link = useLink(props)

    return (
      <Component
        href={props.href}
        ref={link.ref}
        onClick={link.handleClick}
        onMouseEnter={link.handleMouseEnter}
        onTouchStart={link.handleTouchStart}
        isActive={link.isActive}
        isExactActive={link.isExactActive}
        class={link.classes}
        {...(props.style ? { style: props.style } : {})}
        {...(props.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        {...(props['aria-label'] ? { 'aria-label': props['aria-label'] } : {})}
        children={props.children}
      />
    )
  }
}

/**
 * Default navigation link built on an `<a>` tag.
 *
 * @example
 * <Link href="/about" prefetch="viewport">About</Link>
 * <Link href="/posts" activeClass="nav-active">Posts</Link>
 */
export const Link = createLink((props: LinkRenderProps) => (
  <a
    ref={props.ref}
    href={props.href}
    {...(props.class ? { class: props.class } : {})}
    {...(props.style ? { style: props.style } : {})}
    {...(props.target ? { target: props.target } : {})}
    {...(props.rel ? { rel: props.rel } : {})}
    {...(props['aria-label'] ? { 'aria-label': props['aria-label'] } : {})}
    {...(props.isExactActive() ? { 'aria-current': 'page' as const } : {})}
    onClick={props.onClick}
    onMouseEnter={props.onMouseEnter}
    onTouchStart={props.onTouchStart}
  >
    {props.children}
  </a>
))
