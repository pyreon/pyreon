import { reportError } from '@pyreon/core'

/**
 * Run one teardown step that can reach USER code (an `onUnmount` hook, an
 * `onMount` cleanup, a ref callback receiving `null`, a `<For>` row's
 * cleanup), passing `arg`. A throw is logged as `[Pyreon] Error in <label>`
 * and reported (`phase: 'unmount'`), and never stops the teardown around it:
 * the next hook, the next row, the row's node removal, the rest of a root
 * dispose. Without it, one throwing callback escaped the `<For>` reconciler as
 * an unhandled effect error and left every row on screen, or threw out of a
 * root's unmount.
 */
export function guardTeardown(fn: (arg?: null) => unknown, what: string, component = what, arg?: null): void {
  try {
    fn(arg)
  } catch (err) {
    console.error(`[Pyreon] Error in ${what}:`, err)
    reportError({ component, phase: 'unmount', error: err, timestamp: Date.now() })
  }
}

/** Hand a ref `null` at unmount (callback or object ref), guarded as above. */
export function releaseRef(ref: unknown): void {
  if (typeof ref === 'function') guardTeardown(ref as (el?: null) => void, 'ref callback', 'ref callback', null)
  else if (ref != null) (ref as { current: unknown }).current = null
}
