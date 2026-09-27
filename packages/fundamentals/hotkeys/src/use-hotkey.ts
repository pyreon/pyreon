import { onMount, onUnmount } from '@pyreon/core'
import { effect, onCleanup, runUntracked, signal } from '@pyreon/reactivity'
import { registerHotkey } from './registry'
import type { HotkeyOptions } from './types'

/** Options for {@link useHotkey} — `target` may also be a ref / getter. */
export interface UseHotkeyOptions extends Omit<HotkeyOptions, 'target'> {
  /**
   * Listen on a specific element instead of `window`. Besides an
   * `EventTarget`, accepts a getter (e.g. an `elementRef`) that is resolved
   * at MOUNT — during setup a ref is still `null` — and tracked afterwards,
   * so a signal-backed target re-binds when the element changes. While the
   * getter returns `null` the shortcut is not registered anywhere (it never
   * falls back to `window`).
   */
  target?: EventTarget | (() => EventTarget | null | undefined)
}

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
 *   // Scoped to an element that only exists after mount:
 *   const panel = elementRef<HTMLDivElement>()
 *   useHotkey('escape', close, { target: panel })
 *   // ...
 * }
 * ```
 */
export function useHotkey(
  shortcut: string,
  handler: (event: KeyboardEvent) => void,
  options?: UseHotkeyOptions,
): void {
  const target = options?.target
  if (typeof target !== 'function') {
    const unregister = registerHotkey(shortcut, handler, options as HotkeyOptions | undefined)
    onUnmount(unregister)
    return
  }

  // Nothing is resolved before mount (a ref is still null during setup); the
  // effect waits on `mounted`, then tracks the getter for the component's life.
  const mounted = signal(false)
  const watch = effect(() => {
    if (!mounted()) return
    const el = target()
    if (!el) return
    const unregister = runUntracked(() =>
      registerHotkey(shortcut, handler, { ...options, target: el }),
    )
    onCleanup(unregister)
  })
  onMount(() => {
    mounted.set(true)
    return undefined
  })
  onUnmount(() => watch.dispose())
}
