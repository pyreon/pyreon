import { instanceMeta } from './registry'
import type { ActionCall, InstanceMeta, MiddlewareFn } from './types'

// ─── Action runner ────────────────────────────────────────────────────────────

/**
 * Run an action through the middleware chain registered on `meta`.
 * Each middleware receives the call descriptor and a `next` function.
 * If no middlewares, the action runs directly.
 *
 * **Sync + async actions are both supported.** If the underlying action
 * function returns a `Promise`, that promise propagates verbatim through
 * the middleware chain to the caller — `await u.fetchPosts()` works
 * end-to-end. Signal writes inside the async body fire reactively at each
 * `await` checkpoint (Pyreon signals are sync writes); patch listeners
 * see each write as it happens.
 *
 * **Middleware that wants to observe async completion** must explicitly
 * await `next(call)` — the dispatcher does NOT await internally because
 * middleware that doesn't care (e.g. logging the call name on entry)
 * should stay sync. Pattern:
 *
 * ```ts
 * addMiddleware(instance, async (call, next) => {
 *   const start = Date.now()
 *   try {
 *     const result = await next(call)        // observe completion
 *     console.log(`${call.name} ok in ${Date.now() - start}ms`)
 *     return result
 *   } catch (err) {
 *     console.error(`${call.name} threw`, err)
 *     throw err
 *   }
 * })
 * ```
 */
export function runAction(
  meta: InstanceMeta,
  name: string,
  fn: (...fnArgs: unknown[]) => unknown,
  args: unknown[],
): unknown {
  // Guard: an action invoked on a destroyed instance is almost always a bug
  // (a stale handler firing after teardown). Dev-warn + no-op; direct signal
  // writes stay unguarded (the documented escape hatch). Tree-shaken in prod.
  if (!meta.alive) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[Pyreon] state-tree: action "${name}" called on a destroyed model instance — ignored. ` +
          'Stop calling actions after destroy(instance).',
      )
    }
    return undefined
  }

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
  if (!meta) throw new Error('[@pyreon/state-tree] addMiddleware: not a model instance')
  meta.middlewares.push(middleware)
  return () => {
    const idx = meta.middlewares.indexOf(middleware)
    if (idx !== -1) meta.middlewares.splice(idx, 1)
  }
}
