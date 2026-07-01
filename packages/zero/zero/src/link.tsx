import { createRef, isServer } from '@pyreon/core'
import type { CheckHref, LinkConfig } from '@pyreon/router'
import { classifyHref, toRouterPath, useRouter } from '@pyreon/router'
import type { RoutePath } from './route-types'
import { useIntersectionObserver } from './utils/use-intersection-observer'

/** Read the per-router `<Link>` config wired via `createApp({ links })`. */
function linkConfigOf(router: unknown): LinkConfig | undefined {
  return (router as { _linkConfig?: LinkConfig } | null)?._linkConfig
}

// ─── Link component with prefetching ────────────────────────────────────────
//
// Provides client-side navigation, prefetching, and active state tracking.
// Three levels of API:
//
// 1. useLink(props)   — composable returning handlers, state, and ref callback
// 2. createLink(Comp) — HOC wrapping any component with link behavior
// 3. Link             — default <a>-based link (built on createLink)

export interface LinkProps<T extends string = string> {
  /**
   * Navigation target — a registered route, a dynamic `string`, or an external
   * URL. Validated by `CheckHref`: once typed-routes codegen has run, a mistyped
   * internal path (`/abuot`) is a compile error ("did you mean …"), while
   * dynamic strings and external URLs (`https://…`, `mailto:`, `#hash`) are
   * always accepted with no cast. With no routes registered, any string is
   * accepted (the historical behaviour).
   */
  href: CheckHref<T, RoutePath>
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
  /**
   * Force external (`true`) or internal (`false`), overriding auto-detection.
   * Omit to let `<Link>` classify `href` at runtime: external `http(s)` /
   * protocol-relative URLs open in a new tab, `mailto:`/`tel:`/`#hash` are left
   * to the browser, everything else client-navigates.
   */
  external?: boolean
  /** Override the `<a target>` (auto `"_blank"` for external links). */
  target?: string
  /** Override the `<a rel>` (auto `"noopener noreferrer"` on new-tab links). */
  rel?: string
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
  /** Whether this link is an INTERNAL navigation (client router intercepts it). */
  isInternal: () => boolean
  /** Resolved `<a target>` (auto `"_blank"` for external new-tab links). */
  target: () => string | undefined
  /** Resolved `<a rel>` (auto secure `rel` on new-tab links). */
  rel: () => string | undefined
}

const MAX_PREFETCH_CACHE = 200
// Maps href → list of <link> elements injected into <head>. When the
// cache evicts an href (FIFO at MAX_PREFETCH_CACHE), the matching <link>
// elements must be removed too — otherwise head bloats unboundedly
// across long SPA sessions (every Link interaction added 2 <link> nodes
// with no cleanup).
const prefetched = new Map<string, Element[]>()

function doPrefetch(href: string) {
  // Prefetch only fires from browser-mounted Link interactions (hover /
  // click intent). Explicit guard documents the SSR-safety contract.
  if (isServer) return
  if (prefetched.has(href)) return
  // Evict oldest entries when cache is full — AND remove their DOM nodes.
  if (prefetched.size >= MAX_PREFETCH_CACHE) {
    const firstEntry = prefetched.entries().next().value
    if (firstEntry) {
      const [oldestHref, oldestLinks] = firstEntry
      for (const link of oldestLinks) link.remove()
      prefetched.delete(oldestHref)
    }
  }

  const injected: Element[] = []
  const docLink = document.createElement('link')
  docLink.rel = 'prefetch'
  docLink.href = href
  docLink.as = 'document'
  document.head.appendChild(docLink)
  injected.push(docLink)

  try {
    const chunkHint = document.createElement('link')
    chunkHint.rel = 'modulepreload'
    chunkHint.href = href
    document.head.appendChild(chunkHint)
    injected.push(chunkHint)
  } catch {
    // modulepreload is a hint, not critical
  }

  prefetched.set(href, injected)
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
export function useLink<const T extends string = string>(props: LinkProps<T>): UseLinkReturn {
  const router = useRouter()
  const elementRef = createRef<HTMLAnchorElement>()
  const strategy = props.prefetch ?? 'hover'
  // `href` is typed as `CheckHref<…>`; at runtime it is always a string.
  const hrefOf = (): string => props.href as string

  // Only INTERNAL navigations are intercepted; external / mailto / hash are
  // left to the browser. `external` prop overrides the auto-classification.
  const isInternal = (): boolean => {
    if (props.external === true) return false
    if (props.external === false) return true
    return classifyHref(hrefOf(), linkConfigOf(router)) === 'internal'
  }
  const isExternalNewTab = (): boolean => {
    if (props.external === false) return false
    if (props.external === true) return true
    return classifyHref(hrefOf(), linkConfigOf(router)) === 'external'
  }
  // The path client navigation actually pushes (absolute same-origin URLs are
  // stripped to `/path?q#h`; bare paths pass through).
  const routerPath = (): string => toRouterPath(hrefOf())

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
      !isInternal() ||
      !props.href
    ) {
      return
    }
    e.preventDefault()
    router.push(routerPath())
  }

  function handleMouseEnter() {
    if (strategy === 'hover' && isInternal()) {
      doPrefetch(routerPath())
    }
  }

  function handleTouchStart() {
    if ((strategy === 'hover' || strategy === 'viewport') && isInternal()) {
      doPrefetch(routerPath())
    }
  }

  if (strategy === 'viewport') {
    useIntersectionObserver(
      () => elementRef.current ?? undefined,
      () => {
        if (isInternal()) doPrefetch(routerPath())
      },
    )
  }

  const isActive = () => {
    const currentPath = router.currentRoute()?.path
    if (!currentPath || !props.href || !isInternal()) return false
    const path = routerPath()
    if (path === '/') return currentPath === '/'
    return currentPath.startsWith(path)
  }

  const isExactActive = () => {
    const currentPath = router.currentRoute()?.path
    if (!currentPath || !isInternal()) return false
    return currentPath === routerPath()
  }

  const classes = () => {
    const cls: string[] = []
    if (props.class) cls.push(props.class)
    if (props.activeClass && isActive()) cls.push(props.activeClass)
    if (props.exactActiveClass && isExactActive()) cls.push(props.exactActiveClass)
    return cls.join(' ')
  }

  const target = (): string | undefined => {
    if (props.target !== undefined) return props.target
    if (isExternalNewTab() && (linkConfigOf(router)?.externalNewTab ?? true)) return '_blank'
    return undefined
  }
  const rel = (): string | undefined => {
    if (props.rel !== undefined) return props.rel
    if (target() === '_blank') return linkConfigOf(router)?.externalRel ?? 'noopener noreferrer'
    return undefined
  }

  return {
    ref: elementRef,
    handleClick,
    handleMouseEnter,
    handleTouchStart,
    isActive,
    isExactActive,
    classes,
    isInternal,
    target,
    rel,
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
export function createLink(
  Component: (props: LinkRenderProps) => any,
): { <const T extends string>(props: LinkProps<T>): any } {
  function WrappedLink(props: LinkProps) {
    const link = useLink(props)
    // External-ness is a property of `href`; resolve target/rel once at render
    // (matches the historical static `target`/`rel` spread).
    const target = link.target()
    const rel = link.rel()

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
        {...(target ? { target } : {})}
        {...(rel ? { rel } : {})}
        {...(props['aria-label'] ? { 'aria-label': props['aria-label'] } : {})}
        children={props.children}
      />
    )
  }
  return WrappedLink as unknown as { <const T extends string>(props: LinkProps<T>): any }
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
