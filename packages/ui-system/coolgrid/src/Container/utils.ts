import { get } from '@pyreon/ui-core'

/**
 * Resolves the container max-width map using a three-layer fallback:
 * props.width -> theme.grid.container -> theme.coolgrid.container.
 */
type GetContainerWidth = (
  props?: Record<string, unknown> | unknown,
  theme?: Record<string, unknown> | unknown,
) => ReturnType<typeof get>

export const getContainerWidth: GetContainerWidth = (props, theme) =>
  get(props, 'width') || get(theme, 'grid.container') || get(theme, 'coolgrid.container')
