import { createReactiveContext, useContext } from '@pyreon/core'

/**
 * Search-term reactive context — `BoardPage` provides the debounced
 * `?q=` URL state; every `<BoardColumn>` reads it to filter its own
 * state-tree-sourced cards. Reactive so debounce updates propagate.
 */
export const FilterTermCtx = createReactiveContext<string>('')

export function useFilterTerm(): () => string {
  return useContext(FilterTermCtx)
}
