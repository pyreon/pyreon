import { batch, onCleanup, signal } from '@pyreon/reactivity'

import { warnIfInsecureContext } from './secure-context'

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

  // Which copy is the newest. `writeText` is async, so two rapid copies can
  // resolve out of order and the SLOWER, older one would land last — leaving
  // `text()` showing a value the user did not copy last.
  let copyGeneration = 0

  const copy = async (value: string): Promise<boolean> => {
    if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
      warnIfInsecureContext('useClipboard')
      return false
    }
    const generation = ++copyGeneration
    try {
      await navigator.clipboard.writeText(value)
      // A newer copy started while this one was in flight — it owns the state.
      if (generation !== copyGeneration) return true
      // Batch the two synchronous writes so subscribers reading both
      // (e.g. a `<Show when={copied()}>{text()}</Show>`) see one update,
      // not two.
      batch(() => {
        text.set(value)
        copied.set(true)
      })
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
