/**
 * `<Async>` — render one of pending / error / empty / data from any
 * async-shaped source, instead of hand-writing the guard chain at every data
 * boundary.
 *
 * The `of` prop is structural, not a dependency: anything exposing
 * `isPending` / `isError` / `error` / `data` accessors satisfies it, so
 * `@pyreon/query` results, `@pyreon/http` resources and hand-rolled sources
 * all work without `@pyreon/core` importing any of them.
 */

import type { Props, VNode, VNodeChild, VNodeChildAtom } from './types'

/**
 * The structural shape `<Async>` reads. Matches `UseQueryResult` from
 * `@pyreon/query` and the resource shape from `@pyreon/http`.
 */
export interface AsyncLike<T> {
  isPending: () => boolean
  isError: () => boolean
  error: () => unknown
  data: () => T | undefined
}

export interface AsyncProps<T> extends Props {
  /** The async source to render. */
  of: AsyncLike<T>
  /** Rendered while pending. Defaults to nothing. */
  pending?: VNodeChild
  /**
   * Rendered when the source errors.
   *
   * There is no default: an error thrown from a reactive re-run is NOT caught
   * by `<ErrorBoundary>` (only a throw during the initial mount is), so
   * rethrowing here would escape as an unhandled error on exactly the common
   * case — a request that fails after mount. Omitting `error` renders nothing
   * and warns once in development.
   */
  error?: (error: unknown) => VNodeChild
  /**
   * Rendered when the source resolves to no data — `null`/`undefined`, or an
   * empty array.
   *
   * When omitted, an empty array is passed to `children` instead, so a list
   * that renders its own empty state keeps working. Only `null`/`undefined`
   * renders nothing, because there is no value to hand to `children`.
   */
  empty?: VNodeChild
  /** Rendered with the resolved data. */
  children: (value: T) => VNodeChild
}

let warnedMissingError = false

/**
 * @example
 * <Async of={todos} empty="No todos yet.">
 *   {(rows) => <ul>{rows.map((r) => <li>{r.title}</li>)}</ul>}
 * </Async>
 */
export function Async<T>(props: AsyncProps<T>): VNode | null {
  // Returns a reactive accessor; the renderer unwraps it at mount time — the
  // same shape `Show` uses, so every branch re-evaluates on source change.
  return ((): VNodeChildAtom => {
    const source = props.of
    if (source.isPending()) return (props.pending ?? null) as VNodeChildAtom

    if (source.isError()) {
      const err = source.error()
      if (props.error) return props.error(err) as VNodeChildAtom
      if (process.env.NODE_ENV !== 'production' && !warnedMissingError) {
        warnedMissingError = true
        console.warn(
          '[Pyreon] <Async> received an error but has no `error` prop, so nothing ' +
            'was rendered. Pass `error={(e) => …}` to display it. ' +
            '(<ErrorBoundary> cannot catch this — a reactive re-run throws outside its reach.)',
          err,
        )
      }
      return null
    }

    const data = source.data()
    if (data == null) return (props.empty ?? null) as VNodeChildAtom
    if (props.empty !== undefined && Array.isArray(data) && data.length === 0) {
      return props.empty as VNodeChildAtom
    }
    return props.children(data) as VNodeChildAtom
  }) as unknown as VNode
}

/** Test-only: reset the once-per-process missing-`error` warning. */
export function _resetAsyncWarning(): void {
  warnedMissingError = false
}
