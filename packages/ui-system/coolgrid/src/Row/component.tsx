import { nativeCompat, provide, splitProps, useContext } from '@pyreon/core'
import { __DEV__, PKG_NAME } from '../constants'
import { ContainerContext, RowContext } from '../context'
import type { ElementType } from '../types'
import useGridContext from '../useContext'
import { omitCtxKeys } from '../utils'
import Styled from './styled'

/**
 * Row component that reads inherited config from ContainerContext, merges
 * it with its own props, and provides the resolved grid settings (columns,
 * gap, gutter) to Col children via RowContext. Renders a flex-wrap container
 * with negative margins to offset column gutters.
 */

const DEV_PROPS: Record<string, string> = __DEV__ ? { 'data-coolgrid': 'row' } : {}

const Component: ElementType<['containerWidth', 'width', 'rowComponent', 'rowCss']> = (props) => {
  const [own, rest] = splitProps(props, ['children', 'component', 'css', 'contentAlignX'])
  const parentCtx = useContext(ContainerContext)

  const {
    columns,
    gap,
    gutter,
    rowComponent,
    rowCss,
    contentAlignX,
    containerWidth,
    size,
    padding,
    colCss,
    colComponent,
  } = useGridContext({ ...parentCtx, ...rest })

  const context = {
    containerWidth,
    size,
    padding,
    colCss,
    colComponent,
    columns,
    gap,
    gutter,
  }

  const finalProps = {
    $coolgrid: {
      contentAlignX: own.contentAlignX || contentAlignX,
      columns,
      gap,
      gutter,
      extraStyles: own.css || rowCss,
    },
  }

  // Provide row context to Col children
  provide(RowContext, context)

  return (
    <Styled {...omitCtxKeys(rest)} as={own.component || rowComponent} {...finalProps} {...DEV_PROPS}>
      {own.children}
    </Styled>
  )
}

const name = `${PKG_NAME}/Row`

Component.displayName = name
Component.pkgName = PKG_NAME
Component.PYREON__COMPONENT = name

// Mark as native — compat-mode jsx() runtimes skip wrapCompatComponent so
// Row's useContext(ContainerContext) read + provide(RowContext, ...) reach
// Pyreon's setup frame.
nativeCompat(Component)

export default Component
