/**
 * Real-browser keystroke driving.
 *
 * `setInput` sets the input's value through the native value setter (so it
 * bypasses React's controlled-input value tracking the same way a real user
 * keystroke does) and dispatches a bubbling `input` event. React's synthetic
 * `onChange` listens to the native `input` event for text inputs, and Pyreon's
 * delegated `onInput` reads `e.target.value` — so ONE helper drives both
 * frameworks identically, which is the fairness requirement.
 */
export function setInput(el: HTMLInputElement, value: string): void {
  const proto = Object.getPrototypeOf(el) as object
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Count rendered field error elements whose text is non-empty. */
export function visibleErrorCount(container: HTMLElement): number {
  let n = 0
  for (const el of container.querySelectorAll('[data-error]')) {
    if ((el.textContent ?? '').trim().length > 0) n++
  }
  return n
}

/** Count rendered field inputs. */
export function fieldInputCount(container: HTMLElement): number {
  return container.querySelectorAll('input[data-field]').length
}
