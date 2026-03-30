import { onUnmount } from '@pyreon/core'
import { disableScope, enableScope } from './registry'

/**
 * Activate a hotkey scope for the lifetime of a component.
 * When the component unmounts, the scope is deactivated.
 *
 * @example
 * ```tsx
 * function Modal() {
 *   useHotkeyScope('modal')
 *   useHotkey('escape', () => closeModal(), { scope: 'modal' })
 *   // ...
 * }
 * ```
 */
export function useHotkeyScope(scope: string): void {
  enableScope(scope)
  onUnmount(() => disableScope(scope))
}
