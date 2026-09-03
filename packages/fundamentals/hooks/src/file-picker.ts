import { isClient, onCleanup } from '@pyreon/reactivity'

/**
 * The one web implementation behind `useCamera` / `useFilePicker` /
 * `useImagePicker`.
 *
 * All three open a hidden `<input type="file">` and resolve with an object URL
 * or `null`. They differ only in which attributes the input carries, so the
 * lifetime handling lived in three byte-identical copies — and the copies each
 * carried a comment promising a property none of them held:
 *
 * > `change` and `cancel` are mutually exclusive per pick, but a browser that
 * > fires **neither** (or both) must not leak the node or double-resolve.
 *
 * The `settled` flag covers "both". It cannot cover "neither": with no event,
 * `settle` never runs, so `input.remove()` never runs either. The node is
 * appended to `document.body`, so the document then retains it — with its two
 * listeners and the `resolve` closure — for the life of the page, once per
 * pick. `cancel` is the event that would have fired, and it is exactly the one
 * the comments describe as "not universal across older browsers".
 *
 * The missing piece is an owner. A pick is started from an event handler, so it
 * cannot register its own `onCleanup` — there is no reactive scope on the stack
 * by then. The HOOK runs during component setup, where there is one, so the
 * cleanup is registered there and settles whatever is still in flight. That
 * bounds retention to the component's lifetime, which is the contract every
 * other resource in this package already keeps.
 *
 * An unmount-cancelled pick resolves `null` — the same value a dismissed sheet
 * produces. A caller awaiting it is being torn down; handing it `null` lets its
 * existing cancel branch run instead of leaving it awaiting forever.
 */
export function createFilePicker(
  configure: (input: HTMLInputElement) => void,
): () => Promise<string | null> {
  /** Abort handles for picks whose sheet is still open. */
  const inFlight = new Set<() => void>()

  onCleanup(() => {
    // Copy first: each abort deletes itself from the set.
    for (const abort of [...inFlight]) abort()
    inFlight.clear()
  })

  return () => {
    /* v8 ignore next — SSR arm; `isClient` is a module-load constant and this suite runs under happy-dom, so this is unreachable without mocking @pyreon/reactivity (forbidden by the test-environment rules). */
    if (!isClient) return Promise.resolve(null)
    return new Promise<string | null>((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      configure(input)
      // Keep the input out of layout: it is only a programmatic trigger.
      input.style.display = 'none'
      document.body.appendChild(input)

      let settled = false
      const settle = (value: string | null) => {
        if (settled) return
        settled = true
        inFlight.delete(abort)
        input.remove()
        resolve(value)
      }
      const abort = () => settle(null)
      inFlight.add(abort)

      input.addEventListener('change', () => {
        const file = input.files?.[0]
        settle(file ? URL.createObjectURL(file) : null)
      })
      // Fired when the user dismisses the file dialog without choosing. Not
      // universal across older browsers — the `settled` guard makes a double
      // fire harmless, and the hook's `onCleanup` covers a browser that fires
      // neither event at all.
      input.addEventListener('cancel', () => settle(null))

      input.click()
    })
  }
}
