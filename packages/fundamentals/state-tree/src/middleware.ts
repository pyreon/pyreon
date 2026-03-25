import { instanceMeta } from "./registry"
import type { ActionCall, InstanceMeta, MiddlewareFn } from "./types"

// ─── Action runner ────────────────────────────────────────────────────────────

/**
 * Run an action through the middleware chain registered on `meta`.
 * Each middleware receives the call descriptor and a `next` function.
 * If no middlewares, the action runs directly.
 */
export function runAction(
  meta: InstanceMeta,
  name: string,
  fn: (...fnArgs: unknown[]) => unknown,
  args: unknown[],
): unknown {
  const call: ActionCall = { name, args, path: `/${name}` }

  const dispatch = (idx: number, c: ActionCall): unknown => {
    if (idx >= meta.middlewares.length) return fn(...c.args)
    const mw = meta.middlewares[idx]
    if (!mw) return fn(...c.args)
    return mw(c, (nextCall) => dispatch(idx + 1, nextCall))
  }

  return dispatch(0, call)
}

// ─── addMiddleware ────────────────────────────────────────────────────────────

/**
 * Intercept every action call on `instance`.
 * Middlewares run in registration order — call `next(call)` to continue.
 *
 * Returns an unsubscribe function.
 *
 * @example
 * const unsub = addMiddleware(counter, (call, next) => {
 *   console.log(`> ${call.name}(${call.args})`)
 *   const result = next(call)
 *   console.log(`< ${call.name}`)
 *   return result
 * })
 */
export function addMiddleware(instance: object, middleware: MiddlewareFn): () => void {
  const meta = instanceMeta.get(instance)
  if (!meta) throw new Error("[@pyreon/state-tree] addMiddleware: not a model instance")
  meta.middlewares.push(middleware)
  return () => {
    const idx = meta.middlewares.indexOf(middleware)
    if (idx !== -1) meta.middlewares.splice(idx, 1)
  }
}
