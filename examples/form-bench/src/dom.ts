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

/** The email error the SHARED schema produces for the typed word (`TYPED`). */
export const EMAIL_ERROR = 'Invalid email'

/**
 * `keystroke-change` gate. `setInput` writes the native value itself, so
 * `input.value === TYPED` is true even for a library that did NOTHING — a gate
 * that cannot fail. What only the library can produce is the validation result
 * of the per-keystroke run reaching the DOM, so assert that instead.
 */
export function expectEmailError(container: HTMLElement): void {
  const el = container.querySelector('[data-error="email"]')
  const text = (el?.textContent ?? '').trim()
  if (text !== EMAIL_ERROR) {
    throw new Error(`keystroke-change: expected email error "${EMAIL_ERROR}", got "${text}"`)
  }
}

/**
 * `keystroke-*` gate on the LIBRARY's own state — the DOM value alone cannot
 * fail (see `expectEmailError`), so each arm hands its store read here.
 */
export function expectLibraryValue(scenario: string, value: unknown, expected: string): void {
  if (value !== expected) {
    throw new Error(`${scenario}: library state holds ${JSON.stringify(value)}, expected ${JSON.stringify(expected)}`)
  }
}

/**
 * `reset-dirty-form` gate — read from the DOM for EVERY arm (an arm must not
 * be allowed to pass by resetting its store while leaving the inputs dirty):
 * all 12 inputs empty, zero visible errors.
 */
export function expectResetDom(container: HTMLElement): void {
  const inputs = container.querySelectorAll<HTMLInputElement>('input[data-field]')
  if (inputs.length !== 12) throw new Error(`reset: expected 12 inputs, got ${inputs.length}`)
  for (const el of inputs) {
    if (el.value !== '') throw new Error(`reset: input ${el.dataset.field} still holds "${el.value}"`)
  }
  const errs = visibleErrorCount(container)
  if (errs !== 0) throw new Error(`reset: ${errs} errors still visible`)
}

/**
 * `reset-dirty-form` pre-state check (untimed) — every input must actually be
 * dirty before the timed reset, or the reset does no work.
 */
export function expectDirtyDom(container: HTMLElement, expected: Record<string, string>): void {
  for (const el of container.querySelectorAll<HTMLInputElement>('input[data-field]')) {
    const want = expected[el.dataset.field ?? '']
    if (el.value !== want) throw new Error(`reset pre-state: ${el.dataset.field}="${el.value}", expected "${want}"`)
  }
}
