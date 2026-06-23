import { createUniqueId } from '@pyreon/core'

/**
 * Generate a stable, SSR-safe unique id for ARIA relationship attributes
 * (`aria-labelledby`, `aria-describedby`, `aria-controls`, `for`/`id`
 * pairing, etc.). Wraps `@pyreon/core`'s `createUniqueId()` so the same id
 * is produced on the server and rehydrated on the client — no mismatch.
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
