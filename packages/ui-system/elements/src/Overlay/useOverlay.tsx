/**
 * Core hook powering the Overlay component. Manages open/close state, DOM
 * event listeners (click, hover, scroll, resize, ESC key), and dynamic
 * positioning of overlay content relative to its trigger. Supports dropdown,
 * tooltip, popover, and modal types with automatic edge-of-viewport flipping.
 * Event handlers are throttled for performance, and nested overlay blocking
 * is coordinated through the overlay context.
 */

import { signal } from '@pyreon/reactivity'
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

const devWarn = (msg: string) => {
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
    devWarn(
      `[@pyreon/elements] Overlay (${type}): ` +
        `${triggerEl ? 'contentRef' : 'triggerRef'} is not attached. ` +
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
    if (!contentEl) {
      devWarn(
        '[@pyreon/elements] Overlay (modal): contentRef is not attached. ' +
          'Modal position cannot be calculated without a content element.',
      )
      return { pos: {} }
    }
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
  const _prevFocusEl: HTMLElement | null = null
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
    active.set(true)
    onOpen?.()
    ctx.setBlocked?.()
  }

  const hideContent = () => {
    active.set(false)
    isContentLoaded.set(false)
    onClose?.()
    ctx.setUnblocked?.()
  }

  // Position calculation helpers
  const getAncestorOffset = () => {
    if (typeof document === 'undefined') return { top: 0, left: 0 }
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

    if (result.resolvedAlignX) innerAlignX.set(result.resolvedAlignX)
    if (result.resolvedAlignY) innerAlignY.set(result.resolvedAlignY)

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
  // Set up all event listeners on mount, clean up on unmount
  // --------------------------------------------------------------------------
  const setupListeners = () => {
    if (typeof window === 'undefined') return () => {}
    const cleanups: (() => void)[] = []

    // Click-based open/close
    const enabledClick =
      openOn === 'click' || ['click', 'clickOnTrigger', 'clickOutsideContent'].includes(closeOn)

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

    // Cleanup function
    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }

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
    Provider,
  }
}

export default useOverlay
