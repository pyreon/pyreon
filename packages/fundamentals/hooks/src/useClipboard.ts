import { onCleanup, signal } from '@pyreon/reactivity'

export interface UseClipboardResult {
  /** Copy text to clipboard. Returns true on success. */
  copy: (text: string) => Promise<boolean>
  /** Whether the last copy succeeded (resets after timeout). */
  copied: () => boolean
  /** The last successfully copied text. */
  text: () => string
}

/**
 * Reactive clipboard access — copy text and track copied state.
 *
 * @param options.timeout - ms before `copied` resets to false (default: 2000)
 *
 * @example
 * ```tsx
 * const { copy, copied } = useClipboard()
 *
 * <button onClick={() => copy("hello")}>
 *   {() => copied() ? "Copied!" : "Copy"}
 * </button>
 * ```
 */
export function useClipboard(options?: { timeout?: number }): UseClipboardResult {
  const timeout = options?.timeout ?? 2000
  const copied = signal(false)
  const text = signal('')
  let timer: ReturnType<typeof setTimeout> | undefined

  const copy = async (value: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(value)
      text.set(value)
      copied.set(true)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => copied.set(false), timeout)
      return true
    } catch {
      copied.set(false)
      return false
    }
  }

  onCleanup(() => {
    if (timer) clearTimeout(timer)
  })

  return { copy, copied, text }
}
