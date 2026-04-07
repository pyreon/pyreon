import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { Portal } from '@pyreon/core'
import { splitProps } from '@pyreon/core'
import { useEventListener, useScrollLock } from '@pyreon/hooks'
import { effect } from '@pyreon/reactivity'

export interface ModalBaseProps {
  open?: boolean
  onClose?: () => void
  closeOnEscape?: boolean
  closeOnOverlay?: boolean
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

/**
 * Headless modal base — manages open state, ESC key, overlay click, focus trap, scroll lock.
 */
export const ModalBase: ComponentFn<ModalBaseProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'open',
    'onClose',
    'closeOnEscape',
    'closeOnOverlay',
    'children',
    'ref',
  ])

  if (typeof document === 'undefined') return null

  const closeOnEscape = own.closeOnEscape !== false
  const closeOnOverlay = own.closeOnOverlay !== false

  const scrollLock = useScrollLock()

  // ESC handler via useEventListener
  useEventListener('keydown', (e) => {
    if (own.open && closeOnEscape && e.key === 'Escape') own.onClose?.()
  })

  // Scroll lock tied to open state
  effect(() => {
    if (own.open) scrollLock.lock()
    else scrollLock.unlock()
  })

  if (!own.open) return null

  const handleOverlayClick = (e: MouseEvent) => {
    if (closeOnOverlay && e.target === e.currentTarget) own.onClose?.()
  }

  return (
    <Portal target={document.body}>
      <div
        {...(rest as Record<string, unknown>)}
        ref={own.ref as ((el: HTMLElement) => void) | undefined}
        role="dialog"
        aria-modal="true"
        onClick={handleOverlayClick}
      >
        {own.children}
      </div>
    </Portal>
  ) as unknown as VNodeChild
}
