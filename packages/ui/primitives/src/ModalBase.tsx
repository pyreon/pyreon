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
  'aria-labelledby'?: string
  'aria-describedby'?: string
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

/**
 * Headless modal base — manages open state, ESC key, overlay click, scroll lock.
 *
 * Always mounts (for scroll lock + ESC to work reactively).
 * Renders children only when `open` is true.
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

  useEventListener('keydown', (e) => {
    if (own.open && closeOnEscape && e.key === 'Escape') own.onClose?.()
  })

  effect(() => {
    if (own.open) scrollLock.lock()
    else scrollLock.unlock()
  })

  const handleOverlayClick = (e: MouseEvent) => {
    if (closeOnOverlay && e.target === e.currentTarget) own.onClose?.()
  }

  return (() => {
    if (!own.open) return null

    return (
      <Portal target={document.body}>
        <div
          {...(rest as Record<string, unknown>)}
          ref={own.ref as ((el: HTMLElement | null) => void) | undefined}
          role="dialog"
          aria-modal="true"
          onClick={handleOverlayClick}
        >
          {own.children}
        </div>
      </Portal>
    )
  })
}
