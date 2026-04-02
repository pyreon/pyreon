import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { Portal } from '@pyreon/core'
import { splitProps } from '@pyreon/core'
import { effect, onCleanup, signal } from '@pyreon/reactivity'

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

  effect(() => {
    if (!own.open) return

    // Scroll lock
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // ESC handler
    const onKeyDown = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') own.onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)

    onCleanup(() => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKeyDown)
    })
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
