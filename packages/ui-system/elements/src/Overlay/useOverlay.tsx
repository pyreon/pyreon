/**
 * Core hook powering the Overlay component. Manages open/close state, DOM
 * event listeners (click, hover, scroll, resize, ESC key), focus management
 * (restore-to-opener on close for all types; for `type: 'modal'` also
 * focus-in on open + a Tab / Shift+Tab focus trap — the WAI-ARIA dialog
 * pattern), and dynamic positioning of overlay content relative to its
 * trigger. Supports dropdown, tooltip, popover, and modal types with automatic
 * edge-of-viewport flipping. Event handlers are throttled for performance, and
 * nested overlay blocking is coordinated through the overlay context.
 */

import { onMount } from '@pyreon/core'
import { batch, isServer, signal } from '@pyreon/reactivity'
import { throttle } from '@pyreon/ui-core'
import { value } from '@pyreon/unistyle'
import { IS_DEVELOPMENT } from '../utils'
import Provider, { useOverlayContext } from './context'
import {
  adjustForAncestor,
  calcDropdownHorizontal,
  calcDropdownVertical,
  calcModalPos,
  type Align,
  type AlignX,
  type AlignY,
  type OverlayPosition,
} from './positioning'

export type UseOverlayProps = Partial<{
  isOpen: boolean
  openOn: 'click' | 'hover' | 'manual'
  closeOn: 'click' | 'clickOnTrigger' | 'clickOutsideContent' | 'hover' | 'manual'
  type: 'dropdown' | 'tooltip' | 'popover' | 'modal' | 'custom'
  position: 'absolute' | 'fixed' | 'relative' | 'static'
  align: Align
  alignX: AlignX
  alignY: AlignY
  offsetX: number
  offsetY: number
  throttleDelay: number
  parentContainer: HTMLElement | null
  closeOnEsc: boolean
  hoverDelay: number
  disabled: boolean
  onOpen: () => void
  onClose: () => void
}>

// Reference counter for nested modals sharing document.body overflow lock.
let modalOverflowCount = 0

// Tabbable selector for the modal focus trap (mirrors @pyreon/hooks
// useFocusTrap). Used to find the first/last focusable descendant so Tab /
// Shift+Tab cycle WITHIN an open modal instead of escaping to the inert
// background behind it.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Hoisted: closeOn values that count as "click-driven close". Inlined
// previously, allocating a fresh 3-element array on each click-listener
// setupListeners re-run. Ported from vitus-labs `804dd0e2`.
const CLICK_CLOSE_KINDS: ReadonlySet<string> = new Set([
  'click',
  'clickOnTrigger',
  'clickOutsideContent',
])

const devWarn = (msg: string) => {
  // Prod dev-gate: the `!IS_DEVELOPMENT` early-return only fires in a
  // production bundle (where `import.meta.env.DEV` is literal-replaced false
  // and tree-shaken). Tests run with NODE_ENV !== 'production', so this arm
  // is unreachable from the node suite — the dev arm (console.warn) IS
  // covered by the "computePosition missing-ref warning" test.
  /* v8 ignore next */
  if (!IS_DEVELOPMENT) return
  // oxlint-disable-next-line no-console
  console.warn(msg)
}


type ComputeResult = {
  pos: OverlayPosition
  resolvedAlignX?: AlignX
  resolvedAlignY?: AlignY
}

const computePosition = (
  type: string,
  align: Align,
  alignX: AlignX,
  alignY: AlignY,
  offsetX: number,
  offsetY: number,
  triggerEl: HTMLElement | null,
  contentEl: HTMLElement | null,
  ancestorOffset: { top: number; left: number },
): ComputeResult => {
  const isDropdown = ['dropdown', 'tooltip', 'popover'].includes(type)

  if (isDropdown && (!triggerEl || !contentEl)) {
    // `computePosition` is only reached from `calculateContentPosition`, which
    // gates on `isContentLoaded()` — and `isContentLoaded` is set true ONLY by
    // `contentRefCallback(node)` with a non-null node, which also sets
    // `contentEl`. So whenever this branch runs, `contentEl` is present and the
    // missing ref is always the trigger → the `'contentRef'` arm of this
    // ternary is unreachable (the `'triggerRef'` arm IS covered).
    /* v8 ignore next */
    const missingRef = triggerEl ? 'contentRef' : 'triggerRef'
    devWarn(
      `[@pyreon/elements] Overlay (${type}): ` +
        `${missingRef} is not attached. ` +
        'Position cannot be calculated without both refs.',
    )
    return { pos: {} }
  }

  if (isDropdown && triggerEl && contentEl) {
    const c = contentEl.getBoundingClientRect()
    const t = triggerEl.getBoundingClientRect()
    const result =
      align === 'top' || align === 'bottom'
        ? calcDropdownVertical(c, t, align, alignX, offsetX, offsetY)
        : calcDropdownHorizontal(c, t, align as 'left' | 'right', alignY, offsetX, offsetY)

    return {
      pos: adjustForAncestor(result.pos, ancestorOffset),
      resolvedAlignX: result.resolvedAlignX,
      resolvedAlignY: result.resolvedAlignY,
    }
  }

  if (type === 'modal') {
    // Defensive: same `isContentLoaded` gate as the dropdown case above —
    // `computePosition` is only reached when `contentEl` is non-null, so this
    // modal no-content branch is unreachable from the public API. Kept as a
    // guard against a future caller that invokes computePosition directly.
    /* v8 ignore start */
    if (!contentEl) {
      devWarn(
        '[@pyreon/elements] Overlay (modal): contentRef is not attached. ' +
          'Modal position cannot be calculated without a content element.',
      )
      return { pos: {} }
    }
    /* v8 ignore stop */
    const c = contentEl.getBoundingClientRect()
    return {
      pos: adjustForAncestor(calcModalPos(c, alignX, alignY, offsetX, offsetY), ancestorOffset),
    }
  }

  return { pos: {} }
}

const processVisibilityEvent = (
  e: Event,
  active: boolean,
  openOn: string,
  closeOn: string,
  isTrigger: (evt: Event) => boolean,
  isContent: (evt: Event) => boolean,
  showContent: () => void,
  hideContent: () => void,
) => {
  if (!active && openOn === 'click' && e.type === 'click' && isTrigger(e)) {
    showContent()
    return
  }

  if (!active) return

  if (closeOn === 'hover' && e.type === 'scroll') {
    hideContent()
    return
  }

  if (e.type !== 'click') return

  if (closeOn === 'click') {
    hideContent()
  } else if (closeOn === 'clickOnTrigger' && isTrigger(e)) {
    hideContent()
  } else if (closeOn === 'clickOutsideContent' && !isContent(e)) {
    hideContent()
  }
}

const useOverlay = ({
  isOpen = false,
  openOn = 'click',
  closeOn = 'click',
  type = 'dropdown',
  position = 'fixed',
  align = 'bottom',
  alignX: propAlignX = 'left',
  alignY: propAlignY = 'bottom',
  offsetX = 0,
  offsetY = 0,
  throttleDelay = 200,
  parentContainer,
  closeOnEsc = true,
  hoverDelay = 100,
  disabled,
  onOpen,
  onClose,
}: Partial<UseOverlayProps> = {}) => {
  const ctx = useOverlayContext()

  // Signal-based state
  const active = signal(isOpen)
  const isContentLoaded = signal(false)
  const innerAlignX = signal(propAlignX)
  const innerAlignY = signal(propAlignY)
  const blockedCount = signal(0)

  const blocked = () => blockedCount() > 0

  // DOM refs (plain variables, component runs once)
  let triggerEl: HTMLElement | null = null
  let contentEl: HTMLElement | null = null
  // Element focused when the overlay opened (usually the trigger). Captured in
  // showContent, restored in hideContent so keyboard / screen-reader users
  // aren't dropped at the top of the document when a dropdown / popover / modal
  // closes. (Native `<dialog>.showModal()` does this for free — this covers the
  // non-modal overlay types.)
  let _prevFocusEl: HTMLElement | null = null
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null

  const triggerRef = (node: HTMLElement | null) => {
    triggerEl = node
  }

  const contentRefCallback = (node: HTMLElement | null) => {
    contentEl = node
    isContentLoaded.set(!!node)
  }

  const setBlocked = () => blockedCount.update((c) => c + 1)
  const setUnblocked = () => blockedCount.update((c) => Math.max(0, c - 1))

  const showContent = () => {
    // Targeted misuse signal: opening with listeners never attached means
    // positioning, click-outside, ESC, and hover-close are all dead — the
    // historical raw-consumer foot-gun (the hook auto-attaches in component
    // setup now, so this fires only for outside-setup usage that skipped
    // manual `setupListeners()`).
    if (IS_DEVELOPMENT && !isServer && !_listenersAttached) {
      // oxlint-disable-next-line no-console
      console.warn(
        '[Pyreon] useOverlay.showContent() called but setupListeners() was never attached — ' +
          'positioning, click-outside, ESC, and hover-close will not work. ' +
          'Call useOverlay() during component setup (auto-attaches on mount) or call setupListeners() manually.',
      )
    }
    // Capture the element to return focus to on close (typically the trigger).
    if (!isServer) {
      _prevFocusEl = document.activeElement as HTMLElement | null
    }
    active.set(true)
    // Modal only: move focus INTO the content on open so the focus trap (in
    // setupListeners) has somewhere to hold it — otherwise focus stays on the
    // trigger and Tab escapes to the inert background. Deferred a frame so the
    // content (which renders after `active` flips) is mounted. Focuses the
    // first focusable descendant, falling back to the content container.
    if (type === 'modal' && !isServer) {
      requestAnimationFrame(() => {
        if (!active() || !contentEl) return
        const first = contentEl.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
        ;(first ?? contentEl).focus?.()
      })
    }
    onOpen?.()
    ctx.setBlocked?.()
  }

  const hideContent = () => {
    // Decide whether to restore focus BEFORE closing — once `active` flips the
    // content may unmount and `contentEl` go null. Restore only when focus is
    // still INSIDE the closing overlay (or was lost to <body>/null); if the
    // user deliberately moved focus elsewhere (e.g. clicked another control
    // that closed this overlay), leave it there.
    const prev = _prevFocusEl
    _prevFocusEl = null
    let shouldRestore = false
    if (prev && !isServer) {
      const ae = document.activeElement
      const focusInOverlay = !!contentEl && !!ae && (ae === contentEl || contentEl.contains(ae))
      const focusLost = ae === null || ae === document.body
      shouldRestore = focusInOverlay || focusLost
    }
    // batch() so subscribers reading both active + isContentLoaded
    // (e.g. the overlay shell + the content portal) get notified once
    // per close, not twice. Fires on every overlay dismiss path.
    batch(() => {
      active.set(false)
      isContentLoaded.set(false)
    })
    if (shouldRestore && prev && typeof prev.focus === 'function') prev.focus()
    onClose?.()
    ctx.setUnblocked?.()
  }

  // Position calculation helpers
  const getAncestorOffset = () => {
    // SSR guard: unreachable from the node suite because `setupListeners`
    // returns its no-op cleanup on the server BEFORE any resize/scroll
    // listener is attached, so position calculation (the only caller of
    // getAncestorOffset) never runs server-side. Defensive parity with the
    // other isServer guards.
    /* v8 ignore next */
    if (isServer) return { top: 0, left: 0 }
    if (position !== 'absolute' || !contentEl) {
      return { top: 0, left: 0 }
    }

    const offsetParent = contentEl.offsetParent as HTMLElement | null
    if (!offsetParent || offsetParent === document.body) {
      return { top: 0, left: 0 }
    }

    const rect = offsetParent.getBoundingClientRect()
    return { top: rect.top, left: rect.left }
  }

  const calculateContentPosition = () => {
    if (!active() || !isContentLoaded()) return {}

    const result = computePosition(
      type,
      align,
      propAlignX,
      propAlignY,
      offsetX,
      offsetY,
      triggerEl,
      contentEl,
      getAncestorOffset(),
    )

    // batch() so the resolved-align writes notify subscribers once
    // per recompute, not twice. Position recomputes on scroll/resize
    // (throttled but still frequent) and on every viewport change.
    if (result.resolvedAlignX || result.resolvedAlignY) {
      batch(() => {
        // Both `resolvedAlignX` and `resolvedAlignY` are ALWAYS set together
        // by calcDropdownVertical / calcDropdownHorizontal (the only producers
        // of resolved aligns). The modal / no-ref paths return neither and
        // never enter this block. So inside the outer guard both inner ifs
        // always take the truthy arm — the falsy arms are unreachable.
        /* v8 ignore next */
        if (result.resolvedAlignX) innerAlignX.set(result.resolvedAlignX)
        /* v8 ignore next */
        if (result.resolvedAlignY) innerAlignY.set(result.resolvedAlignY)
      })
    }

    return result.pos
  }

  const assignContentPosition = (values: OverlayPosition = {}) => {
    if (!contentEl) return

    const el = contentEl
    const setValue = (param?: string | number) => value(param, 16) as string

    el.style.position = position

    el.style.top = values.top != null ? setValue(values.top) : ''
    el.style.bottom = values.bottom != null ? setValue(values.bottom) : ''
    el.style.left = values.left != null ? setValue(values.left) : ''
    el.style.right = values.right != null ? setValue(values.right) : ''
  }

  const setContentPosition = () => {
    const currentPosition = calculateContentPosition()
    assignContentPosition(currentPosition)
  }

  const isNodeOrChild = (getRef: () => HTMLElement | null) => (e: Event) => {
    const ref = getRef()
    if (e?.target && ref) {
      return ref.contains(e.target as Element) || e.target === ref
    }
    return false
  }

  const handleVisibilityByEventType = (e: Event) => {
    if (blocked() || disabled) return

    processVisibilityEvent(
      e,
      active(),
      openOn,
      closeOn,
      isNodeOrChild(() => triggerEl),
      isNodeOrChild(() => contentEl),
      showContent,
      hideContent,
    )
  }

  const handleContentPosition = throttle(() => setContentPosition(), throttleDelay)

  const handleClick = (e: Event) => handleVisibilityByEventType(e)

  const handleVisibility = throttle((e: Event) => handleVisibilityByEventType(e), throttleDelay)

  // --------------------------------------------------------------------------
  // Set up all event listeners on mount, clean up on unmount.
  //
  // IDEMPOTENT: the hook auto-attaches via `onMount` below AND the built-in
  // Overlay component historically calls `setupListeners()` in its own
  // onMount — the second call must return the FIRST call's cleanup instead of
  // attaching everything twice (anti-patterns class D: re-push the cached
  // cleanup). The cleanup itself is also idempotent (both registered cleanups
  // run on unmount) and resets the flag so a re-mount (KeepAlive) re-attaches.
  // --------------------------------------------------------------------------
  let _listenersAttached = false
  let _listenersCleanup: (() => void) | null = null
  const setupListeners = () => {
    if (isServer) return () => {}
    if (_listenersAttached && _listenersCleanup) return _listenersCleanup
    _listenersAttached = true
    const cleanups: (() => void)[] = []

    // Position-on-open: reposition when the overlay opens AND when the
    // portaled content actually mounts (`isContentLoaded` flips as the
    // content ref registers — a beat after `active`). Without this, nothing
    // ever positioned the content on open — `setContentPosition` was only
    // reachable through the throttled resize/scroll handlers, so every
    // dropdown/tooltip rendered at the document origin until the window
    // scrolled or resized. Plain signal subscriptions (not `effect()`): the
    // deps are exactly these two signals, and the disposers ride the same
    // cleanup path as the listeners. The rAF defers measurement one frame so
    // layout settles after the Portal mount; the inner re-check guards
    // against a close (or unmount) racing the frame.
    const repositionOnOpen = () => {
      if (!active() || !isContentLoaded()) return
      requestAnimationFrame(() => {
        if (active() && isContentLoaded()) setContentPosition()
      })
    }
    cleanups.push(active.subscribe(repositionOnOpen))
    cleanups.push(isContentLoaded.subscribe(repositionOnOpen))
    // Content may already be open+mounted when listeners attach late
    // (manual setupListeners after showContent) — position it now.
    repositionOnOpen()

    // Click-based open/close
    const enabledClick = openOn === 'click' || CLICK_CLOSE_KINDS.has(closeOn)

    if (enabledClick) {
      window.addEventListener('click', handleClick)
      cleanups.push(() => window.removeEventListener('click', handleClick))
    }

    // ESC key
    if (closeOnEsc) {
      const handleEscKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && active() && !blocked()) {
          hideContent()
        }
      }
      window.addEventListener('keydown', handleEscKey)
      cleanups.push(() => window.removeEventListener('keydown', handleEscKey))
    }

    // Focus trap (modal only): keep Tab / Shift+Tab cycling WITHIN the open
    // modal content so keyboard / screen-reader users can't tab out to the
    // inert background behind it (the WAI-ARIA dialog pattern). Registered
    // once; the body is gated on `active()` so it only traps while open, and
    // reads `contentEl` live (it mounts after `active` flips). Pairs with the
    // focus-restore in hideContent + the initial focus-in in showContent.
    if (type === 'modal') {
      const handleFocusTrap = (e: KeyboardEvent) => {
        if (e.key !== 'Tab' || !active() || !contentEl) return
        const focusable = Array.from(
          contentEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        )
        if (focusable.length === 0) {
          // Nothing focusable inside — keep focus pinned to the content so it
          // can't escape to the background.
          e.preventDefault()
          contentEl.focus?.()
          return
        }
        const first = focusable[0] as HTMLElement
        const last = focusable[focusable.length - 1] as HTMLElement
        const ae = document.activeElement
        if (e.shiftKey && (ae === first || ae === contentEl)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && ae === last) {
          e.preventDefault()
          first.focus()
        }
      }
      window.addEventListener('keydown', handleFocusTrap)
      cleanups.push(() => window.removeEventListener('keydown', handleFocusTrap))
    }

    // Hover-based open/close
    const enabledHover = openOn === 'hover' || closeOn === 'hover'
    if (enabledHover) {
      const clearHoverTimeout = () => {
        if (hoverTimeout != null) {
          clearTimeout(hoverTimeout)
          hoverTimeout = null
        }
      }

      const scheduleHide = () => {
        clearHoverTimeout()
        hoverTimeout = setTimeout(hideContent, hoverDelay)
      }

      const onTriggerEnter = () => {
        clearHoverTimeout()
        if (openOn === 'hover' && !active()) showContent()
      }

      const onTriggerLeave = () => {
        if (closeOn === 'hover' && active()) scheduleHide()
      }

      const onContentEnter = () => {
        clearHoverTimeout()
      }

      const onContentLeave = () => {
        if (closeOn === 'hover' && active()) scheduleHide()
      }

      // We need to defer listener attachment until refs are available
      const attachHoverListeners = () => {
        if (triggerEl) {
          triggerEl.addEventListener('mouseenter', onTriggerEnter)
          triggerEl.addEventListener('mouseleave', onTriggerLeave)
        }
        if (contentEl) {
          contentEl.addEventListener('mouseenter', onContentEnter)
          contentEl.addEventListener('mouseleave', onContentLeave)
        }
      }

      attachHoverListeners()

      cleanups.push(() => {
        clearHoverTimeout()
        if (triggerEl) {
          triggerEl.removeEventListener('mouseenter', onTriggerEnter)
          triggerEl.removeEventListener('mouseleave', onTriggerLeave)
        }
        if (contentEl) {
          contentEl.removeEventListener('mouseenter', onContentEnter)
          contentEl.removeEventListener('mouseleave', onContentLeave)
        }
      })
    }

    // Resize/scroll repositioning
    const shouldSetOverflow = type === 'modal'

    const onScroll = (e: Event) => {
      handleContentPosition()
      handleVisibility(e)
    }

    if (shouldSetOverflow) {
      modalOverflowCount++
      if (modalOverflowCount === 1) document.body.style.overflow = 'hidden'
    }

    window.addEventListener('resize', handleContentPosition)
    window.addEventListener('scroll', onScroll, { passive: true })
    cleanups.push(() => {
      handleContentPosition.cancel()
      handleVisibility.cancel()
      if (shouldSetOverflow) {
        modalOverflowCount--
        if (modalOverflowCount === 0) document.body.style.overflow = ''
      }
      window.removeEventListener('resize', handleContentPosition)
      window.removeEventListener('scroll', onScroll)
    })

    // Parent container scroll
    if (parentContainer) {
      if (closeOn !== 'hover') parentContainer.style.overflow = 'hidden'

      const onParentScroll = (e: Event) => {
        handleContentPosition()
        handleVisibility(e)
      }

      parentContainer.addEventListener('scroll', onParentScroll, {
        passive: true,
      })
      cleanups.push(() => {
        parentContainer.style.overflow = ''
        parentContainer.removeEventListener('scroll', onParentScroll)
      })
    }

    // Cleanup function — idempotent (may be invoked twice: once via the
    // hook's auto-attach onMount, once via a component's own onMount that
    // received the cached reference) and resets the attach flag so a
    // re-mount re-attaches.
    _listenersCleanup = () => {
      if (!_listenersAttached) return
      _listenersAttached = false
      _listenersCleanup = null
      for (const cleanup of cleanups) cleanup()
    }
    return _listenersCleanup
  }

  // Auto-attach: inside component setup (the overwhelmingly common case) the
  // listeners wire themselves on mount — raw `useOverlay` consumers no longer
  // ship dead triggers because they didn't know about `setupListeners()`.
  // `setupListeners` stays returned for manual control (idempotent, so the
  // built-in Overlay component's explicit call is a no-op after this) and for
  // outside-setup usage, where `onMount` is a no-op and manual wiring remains
  // required.
  onMount(() => setupListeners())

  // Handle disabled state
  if (disabled) {
    active.set(false)
  }

  return {
    triggerRef,
    contentRef: contentRefCallback,
    active,
    align,
    alignX: innerAlignX,
    alignY: innerAlignY,
    showContent,
    hideContent,
    blocked,
    setBlocked,
    setUnblocked,
    setupListeners,
    // Manual reposition — for content whose SIZE changes while open (async
    // option lists, images loading) where no resize/scroll event fires.
    setContentPosition,
    Provider,
  }
}

export default useOverlay
