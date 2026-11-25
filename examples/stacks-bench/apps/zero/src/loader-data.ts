// This arm runs against TWO sources of `@pyreon/*` (see ../../../README.md and
// stacks-bench-smoke.yml): the npm release its lockfile pins, where
// `useLoaderData()` returns the data, and the workspace, where it returns an
// accessor `() => T` (#4814). Both must render the same page, so the arm reads
// loader data through this helper. Remove it, and call `useLoaderData()`
// directly, once the pin moves to a release with the accessor API.
import { useLoaderData } from '@pyreon/router'

export function useArmLoaderData<T>(): () => T {
  const value: unknown = useLoaderData<T>()

  return typeof value === 'function' ? (value as () => T) : () => value as T
}
