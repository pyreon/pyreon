import { onMount, onUnmount } from '@pyreon/core'

export interface UseKeyboardOptions {
  /** Which event to listen for. Default `'keydown'`. */
  event?: 'keydown' | 'keyup'
  /** Where to listen. Default `document`. */
  target?: EventTarget
  /**
   * Skip the key when it is typed into an editable field (`<input>`,
   * `<textarea>`, `<select>`, `contenteditable`). Default `false`, so an
   * `Escape` handler still fires while a field is focused — turn it on for
   * single-letter shortcuts, which otherwise fire as the user types.
   */
  ignoreInputs?: boolean
}

function isEditable(target: EventTarget): boolean {
  const el = target as HTMLElement
  if (typeof el.tagName !== 'string') return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}

/**
 * Listen for a specific key press.
 */
export function useKeyboard(
  key: string,
  handler: (event: KeyboardEvent) => void,
  options?: UseKeyboardOptions,
): void {
  const eventName = options?.event ?? 'keydown'

  const listener = (e: Event) => {
    const ke = e as KeyboardEvent
    if (ke.key !== key) return
    // composedPath()[0], not `target`: a shadow root retargets `target` to its
    // host, so an input inside a web component would read as a plain element.
    // During dispatch the path always starts with the real target.
    if (options?.ignoreInputs && isEditable(ke.composedPath()[0] as EventTarget)) return
    handler(ke)
  }

  onMount(() => {
    const target = options?.target ?? document
    target.addEventListener(eventName, listener)
    return undefined
  })

  onUnmount(() => {
    const target = options?.target ?? document
    target.removeEventListener(eventName, listener)
  })
}
