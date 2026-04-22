import type { ComponentFn, Props, VNodeChild } from '@pyreon/core'
import { ErrorBoundary, h } from '@pyreon/core'

// ─── NotFound symbol + throw ────────────────────────────────────────────────

const NOT_FOUND = Symbol.for('pyreon.notFound')

/**
 * Throw inside a route loader or component to trigger the nearest
 * NotFoundBoundary. Inspired by Next.js's `notFound()`.
 *
 * @example
 * ```ts
 * // In a loader:
 * loader: async ({ params }) => {
 *   const user = await fetchUser(params.id)
 *   if (!user) notFound()
 *   return user
 * }
 * ```
 */
export function notFound(message?: string): never {
  const err = new Error(message ?? 'Not Found')
  ;(err as unknown as Record<symbol, unknown>)[NOT_FOUND] = true
  throw err
}

/** Check if an error is a NotFoundError thrown by `notFound()`. */
export function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as Record<string | symbol, unknown>)[NOT_FOUND] === true
  )
}

// ─── NotFoundBoundary ──────────────────────────────────────────────────────

export interface NotFoundBoundaryProps extends Props {
  /** Component or VNode to render when notFound() is thrown */
  fallback: ComponentFn | VNodeChild
  children?: VNodeChild
}

/**
 * Catches `notFound()` errors from child route components or loaders
 * and renders the fallback. Wraps Pyreon's ErrorBoundary with notFound
 * detection — non-notFound errors propagate to parent error boundaries.
 *
 * @example
 * ```tsx
 * <NotFoundBoundary fallback={<NotFoundPage />}>
 *   <RouterView />
 * </NotFoundBoundary>
 * ```
 */
export const NotFoundBoundary: ComponentFn<NotFoundBoundaryProps> = (props) => {
  return h(
    ErrorBoundary,
    {
      fallback: (err: unknown, reset: () => void) => {
        if (!isNotFoundError(err)) {
          // Re-throw non-notFound errors so they propagate
          throw err
        }
        const fb = props.fallback
        if (typeof fb === 'function' && fb.length <= 1) {
          return h(fb as ComponentFn, { error: err, reset })
        }
        return fb as VNodeChild
      },
    },
    props.children,
  )
}
