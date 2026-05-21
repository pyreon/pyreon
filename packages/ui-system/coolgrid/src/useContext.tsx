import { useContext } from '@pyreon/core'
import { get, pick } from '@pyreon/ui-core'
import { context } from '@pyreon/unistyle'
import { CONTEXT_KEYS } from './constants'
import type { Context, Obj, ValueType } from './types'

/**
 * Resolves grid columns and container width using a three-layer fallback:
 * 1. Explicit component props (e.g. `columns={6}`)
 * 2. `theme.grid.columns` / `theme.grid.container`
 * 3. `theme.coolgrid.columns` / `theme.coolgrid.container`
 */
type GetGridContext = (
  props: Obj,
  theme: Obj,
) => {
  columns?: ValueType
  containerWidth?: Record<string, number>
}

export const getGridContext: GetGridContext = (props = {}, theme = {}) => ({
  // `props` is always a plain object (callers pass a `pick()` result or a
  // user-supplied object literal), so direct property access is safe and
  // skips `get`'s path-parsing for these single-key lookups. Ported from
  // vitus-labs `55402572`. Two `get` calls per `getGridContext` invocation
  // saved; fires once per Container/Row/Col render.
  columns: ((props as Obj).columns ||
    get(theme, 'grid.columns') ||
    get(theme, 'coolgrid.columns')) as ValueType,
  containerWidth: ((props as Obj).width ||
    get(theme, 'grid.container') ||
    get(theme, 'coolgrid.container')) as Record<string, number>,
})

/**
 * Hook that reads the unistyle theme context and merges it with the
 * component's own props to produce the final grid configuration.
 * Applies the three-layer resolution (props -> grid.* -> coolgrid.*).
 */
type UseGridContext = (props: Obj) => Context
const useGridContext: UseGridContext = (props) => {
  const getCtx = useContext(context)
  const { theme } = getCtx()
  // Direct `pick` (vs the `pickThemeProps` one-liner wrapper that was
  // removed in vitus-labs `55402572`) saves one function call per render.
  const ctxProps = pick(props, CONTEXT_KEYS as Array<keyof typeof props>)
  const gridContext = getGridContext(ctxProps, theme as Record<string, unknown>)

  return { ...gridContext, ...ctxProps }
}

export default useGridContext
