import { get } from '@pyreon/ui-core'
import { defaultContainerWidthsFor } from '../defaults'

/**
 * Resolves the container max-width map using a three-layer fallback:
 * props.width -> theme.grid.container -> theme.coolgrid.container -> coolgrid's
 * default widths (only when the theme has no breakpoints of its own).
 */
type GetContainerWidth = (
  props?: Record<string, unknown> | unknown,
  theme?: Record<string, unknown> | unknown,
) => ReturnType<typeof get>

export const getContainerWidth: GetContainerWidth = (props, theme) =>
  get(props, 'width') ||
  get(theme, 'grid.container') ||
  get(theme, 'coolgrid.container') ||
  defaultContainerWidthsFor(theme as Record<string, unknown> | undefined)
