import { onMount, onUnmount } from "@pyreon/core"

/**
 * Listen for a specific key press.
 */
export function useKeyboard(
  key: string,
  handler: (event: KeyboardEvent) => void,
  options?: { event?: "keydown" | "keyup"; target?: EventTarget },
): void {
  const eventName = options?.event ?? "keydown"

  const listener = (e: Event) => {
    const ke = e as KeyboardEvent
    if (ke.key === key) handler(ke)
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
