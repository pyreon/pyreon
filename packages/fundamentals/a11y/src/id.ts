import { createUniqueId } from '@pyreon/core'

/**
 * Generate a unique id for ARIA relationship attributes (`aria-labelledby`,
 * `aria-describedby`, `aria-controls`, `for`/`id` pairing, etc.). Wraps
 * `@pyreon/core`'s `createUniqueId()`.
 *
 * SSR caveat: the id comes from a counter, so server and client agree only
 * while both call it in the same order the same number of times. The counter
 * is not currently reset per SSR request, so a long-running server can hand
 * out ids the hydrating client does not reproduce. The relationship still
 * works (the client re-renders both ends with its own id) — do not rely on a
 * server-rendered id being byte-identical after hydration.
 *
 * Use it to wire two elements together when you don't have a natural id:
 *
 * @example
 * ```tsx
 * function Field() {
 *   const labelId = createA11yId('label')
 *   const inputId = createA11yId('input')
 *   return (
 *     <>
 *       <span id={labelId}>Email</span>
 *       <input id={inputId} aria-labelledby={labelId} />
 *     </>
 *   )
 * }
 * ```
 *
 * @param prefix - Readable prefix for the generated id (default `'px-a11y'`).
 *   Helps when inspecting the DOM; has no functional effect.
 */
export function createA11yId(prefix = 'px-a11y'): string {
  return `${prefix}-${createUniqueId()}`
}
