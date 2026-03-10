import { createContext, pushContext, popContext, onUnmount, useContext } from "@pyreon/core"
import type { VNodeChild, VNode } from "@pyreon/core"
import type { Props } from "@pyreon/core"
import { useQueryClient } from "./query-client"

// ─── Context ────────────────────────────────────────────────────────────────

interface ErrorResetBoundaryValue {
  reset: () => void
}

const QueryErrorResetBoundaryContext = createContext<ErrorResetBoundaryValue | null>(null)

// ─── QueryErrorResetBoundary ─────────────────────────────────────────────────

export interface QueryErrorResetBoundaryProps extends Props {
  children?: VNodeChild
}

/**
 * Wraps a subtree so that `useQueryErrorResetBoundary()` descendants can reset
 * all errored queries within this boundary.
 *
 * Pair with Pyreon's `ErrorBoundary` to retry failed queries when the user
 * dismisses the error fallback:
 *
 * @example
 * h(QueryErrorResetBoundary, null,
 *   h(ErrorBoundary, {
 *     fallback: (err, boundaryReset) => {
 *       const { reset } = useQueryErrorResetBoundary()
 *       return h('button', {
 *         onClick: () => { reset(); boundaryReset() },
 *       }, 'Retry')
 *     },
 *   }, h(MyComponent, null)),
 * )
 */
export function QueryErrorResetBoundary(props: QueryErrorResetBoundaryProps): VNode {
  const client = useQueryClient()

  const value: ErrorResetBoundaryValue = {
    reset: () => {
      // Reset all active queries that are in error state so they refetch.
      client.refetchQueries({ predicate: (query) => query.state.status === "error" })
    },
  }

  const frame = new Map([[QueryErrorResetBoundaryContext.id, value]])
  pushContext(frame)
  onUnmount(() => popContext())

  const ch = props.children
  return (typeof ch === "function" ? (ch as () => VNodeChild)() : ch) as VNode
}

// ─── useQueryErrorResetBoundary ──────────────────────────────────────────────

/**
 * Returns the `reset` function provided by the nearest `QueryErrorResetBoundary`.
 * If called outside a boundary, falls back to resetting all errored queries
 * on the current `QueryClient`.
 *
 * @example
 * // Inside an ErrorBoundary fallback:
 * const { reset } = useQueryErrorResetBoundary()
 * h('button', { onClick: () => { reset(); boundaryReset() } }, 'Retry')
 */
export function useQueryErrorResetBoundary(): ErrorResetBoundaryValue {
  const boundary = useContext(QueryErrorResetBoundaryContext)
  if (boundary) return boundary

  // Fallback: no explicit boundary — use the QueryClient directly.
  const client = useQueryClient()
  return {
    reset: () => {
      client.refetchQueries({ predicate: (query) => query.state.status === "error" })
    },
  }
}
