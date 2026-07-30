/**
 * Query states — the four states every data component has, without a network.
 *
 * A component that fetches has loading, error, success, and refetching. In
 * Storybook each is a hand-written story plus an `msw` handler, which is why
 * most projects ship one (success) and discover the other three in production.
 *
 * Here it is one panel: pick a state, the preview re-renders under it. The
 * component reads `ctx.query` exactly as it would read a real `useQuery`
 * result, so what is exercised is the component's own branching.
 *
 * ── Why this fabricates a result instead of driving a real QueryClient ────
 *
 * The states worth checking include ones a real client makes HARD to produce on
 * demand — a stuck `pending`, an error that is not a network flake, a
 * `refetching` that holds stale data while fetching. Driving those through a
 * real client means mocking the transport anyway, and then the thing under test
 * is the mock's timing rather than the component's branching.
 *
 * The shape is mirrored from `UseQueryResult` — and the mirror is LOCKED by a
 * type-level assertion below (`QUERY_RESULT_MIRROR_LOCKED`), so a field
 * renamed or retyped in the adapter is a typecheck failure here, not a silent
 * drift. (An earlier version of this comment claimed the lock existed while
 * nothing imported the adapter at all — the exact silent-drift the claim
 * denied.)
 */
import { signal, type Signal } from '@pyreon/reactivity'
import type { UseQueryResult } from '@pyreon/query'

/** The four states, in the order a request moves through them. */
export type QueryStateId = 'loading' | 'success' | 'error' | 'refetching'

export interface QueryStatePreset {
  id: QueryStateId
  label: string
  /** One line on what the component should be showing. */
  hint: string
}

export const QUERY_STATES: readonly QueryStatePreset[] = [
  { id: 'loading', label: 'Loading', hint: 'first load — no data yet' },
  { id: 'success', label: 'Success', hint: 'data present, not fetching' },
  { id: 'error', label: 'Error', hint: 'failed, no data' },
  {
    id: 'refetching',
    label: 'Refetching',
    hint: 'STALE data on screen while a new request is in flight',
  },
]

export function queryStateById(id: QueryStateId): QueryStatePreset {
  return QUERY_STATES.find((s) => s.id === id) ?? QUERY_STATES[0]!
}

/**
 * The subset of `UseQueryResult` a component branches on.
 *
 * Deliberately not the whole interface: `result` exposes the raw TanStack
 * observer result, which cannot be fabricated honestly, and a component reading
 * it is reaching past the adapter. Everything a component needs to RENDER is
 * here.
 */
export interface FakeQueryResult<TData = unknown> {
  data: Signal<TData | undefined>
  error: Signal<Error | null>
  status: Signal<'pending' | 'error' | 'success'>
  isPending: Signal<boolean>
  isLoading: Signal<boolean>
  isFetching: Signal<boolean>
  isError: Signal<boolean>
  isSuccess: Signal<boolean>
  refetch: () => Promise<void>
}

type MutualExtends<A, B> = A extends B ? (B extends A ? true : never) : never

/**
 * The drift lock. `FakeQueryResult` must stay field-for-field identical to the
 * adapter's `UseQueryResult` minus the two deliberate departures (`result` —
 * the raw observer, unfabricatable; `refetch` — narrowed return). If the
 * adapter renames or retypes a field, this constant's type collapses to
 * `never` and the assignment below is the typecheck failure.
 */
export const QUERY_RESULT_MIRROR_LOCKED: MutualExtends<
  Omit<FakeQueryResult<number>, 'refetch'>,
  Omit<UseQueryResult<number, Error>, 'result' | 'refetch'>
> = true

/**
 * Build a result for one state.
 *
 * The `refetching` case is the one worth getting exactly right, and the one
 * hand-written stories almost always get wrong: TanStack keeps `status:
 * 'success'` and the PREVIOUS data while `isFetching` is true. A component that
 * renders a spinner instead of the stale rows there is a real bug — and it is
 * invisible if "refetching" is modelled as loading-with-no-data.
 */
export function makeQueryResult<TData>(
  state: QueryStateId,
  data: TData,
  error: Error = new Error('Request failed'),
): FakeQueryResult<TData> {
  const success = state === 'success' || state === 'refetching'
  const isFetching = state === 'loading' || state === 'refetching'

  return {
    data: signal<TData | undefined>(success ? data : undefined),
    error: signal<Error | null>(state === 'error' ? error : null),
    status: signal<'pending' | 'error' | 'success'>(
      state === 'error' ? 'error' : success ? 'success' : 'pending',
    ),
    isPending: signal(state === 'loading'),
    // `isLoading` is TanStack's "first load": pending AND fetching. A refetch
    // is NOT loading, which is exactly the distinction this panel exists to
    // let someone see.
    isLoading: signal(state === 'loading'),
    isFetching: signal(isFetching),
    isError: signal(state === 'error'),
    isSuccess: signal(success),
    refetch: async () => {},
  }
}

/**
 * What a component SHOULD be showing in each state — rendered next to the
 * selector so the panel teaches the distinction rather than just toggling it.
 */
export const EXPECTED: Record<QueryStateId, string> = {
  loading: 'a skeleton or spinner, and no data',
  success: 'the data, with no loading affordance',
  error: 'an error message and a way to retry — not an empty list',
  refetching: 'the PREVIOUS data, optionally with a subtle busy hint',
}
