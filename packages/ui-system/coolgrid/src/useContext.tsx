import { useContext } from "@pyreon/core"
import { get, pick } from "@pyreon/ui-core"
import { context } from "@pyreon/unistyle"
import { CONTEXT_KEYS } from "./constants"
import type { Context, Obj, ValueType } from "./types"

/**
 * Picks only the recognized grid configuration keys from a props object,
 * filtering out any non-grid props before they enter context resolution.
 */
export type PickThemeProps = <T extends Record<string, unknown>>(
  props: T,
  keywords: Array<keyof T>,
) => ReturnType<typeof pick>
const pickThemeProps: PickThemeProps = (props, keywords) => pick(props, keywords)

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
  columns: (get(props, "columns") ||
    get(theme, "grid.columns") ||
    get(theme, "coolgrid.columns")) as ValueType,
  containerWidth: (get(props, "width") ||
    get(theme, "grid.container") ||
    get(theme, "coolgrid.container")) as Record<string, number>,
})

/**
 * Hook that reads the unistyle theme context and merges it with the
 * component's own props to produce the final grid configuration.
 * Applies the three-layer resolution (props -> grid.* -> coolgrid.*).
 */
type UseGridContext = (props: Obj) => Context
const useGridContext: UseGridContext = (props) => {
  const { theme } = useContext(context)
  const ctxProps = pickThemeProps(props, CONTEXT_KEYS)
  const gridContext = getGridContext(ctxProps, theme as Record<string, unknown>)

  return { ...gridContext, ...ctxProps }
}

export default useGridContext
