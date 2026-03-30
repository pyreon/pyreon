import { onUnmount } from '@pyreon/core'
import { registerHotkey } from './registry'
import type { HotkeyOptions } from './types'

/**
 * Register a keyboard shortcut scoped to a component's lifecycle.
 * Automatically unregisters when the component unmounts.
 *
 * @example
 * ```ts
 * function Editor() {
 *   useHotkey('ctrl+s', () => save(), { description: 'Save document' })
 *   useHotkey('ctrl+z', () => undo())
 *   useHotkey('ctrl+shift+z', () => redo())
 *   // ...
 * }
 * ```
 */
export function useHotkey(
  shortcut: string,
  handler: (event: KeyboardEvent) => void,
  options?: HotkeyOptions,
): void {
  const unregister = registerHotkey(shortcut, handler, options)
  onUnmount(unregister)
}
