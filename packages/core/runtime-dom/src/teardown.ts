import { reportError } from '@pyreon/core'

/**
 * Run one teardown step that can reach USER code, passing it `arg`: a
 * component's `onUnmount` hook or `onMount` cleanup (`component` = its name),
 * or a ref receiving `null` (`component` = null). A throw is logged as
 * `[Pyreon] Error in onUnmount hook of <Name>` or `[Pyreon] Error in ref
 * callback` and reported (`phase: 'unmount'`); the label is built only then.
 * It never stops the teardown around it: the next hook, the rest of the
 * component unmount, the `<For>` update or root dispose that triggered it.
 * Without it, one throwing callback escaped a `<For>` update as an unhandled
 * effect error and left every row on screen, or threw out of a root's unmount.
 */
export function guardTeardown<A>(fn: (arg: A) => unknown, component: string | null, arg: A): void {
  try {
    fn(arg)
  } catch (err) {
    // Two literal messages, so `diagnose` (ERROR_PATTERNS) can match each.
    if (component === null) console.error('[Pyreon] Error in ref callback:', err)
    else console.error(`[Pyreon] Error in onUnmount hook of <${component}>:`, err)
    reportError({ component: component ?? 'ref callback', phase: 'unmount', error: err, timestamp: Date.now() })
  }
}

const clearCurrent = (ref: { current: unknown }): void => {
  ref.current = null
}

/**
 * Hand a ref `null` at unmount, guarded as above: a callback ref is called,
 * an object ref's `current` is cleared (its setter can be user code: a
 * signal-backed ref, a Proxy). A falsy ref (`ref={cond && r}`) is no ref.
 */
export function releaseRef(ref: unknown): void {
  if (!ref) return
  if (typeof ref === 'function') guardTeardown(ref as (el: null) => void, null, null)
  else guardTeardown(clearCurrent, null, ref as { current: unknown })
}
