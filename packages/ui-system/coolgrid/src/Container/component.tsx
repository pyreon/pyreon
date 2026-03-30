import { provide } from '@pyreon/core'
import { PKG_NAME } from '../constants'
import ContainerContext from '../context/ContainerContext'
import type { ElementType } from '../types'
import useGridContext from '../useContext'
import { omitCtxKeys } from '../utils'
import Styled from './styled'

/**
 * Container component that establishes the outermost grid boundary.
 * Resolves grid config from the theme, provides it to descendant Row/Col
 * components via ContainerContext, and renders a styled wrapper with
 * responsive max-width.
 */

const DEV_PROPS: Record<string, string> =
  process.env.NODE_ENV !== 'production' ? { 'data-coolgrid': 'container' } : {}

const Component: ElementType<['containerWidth']> = ({
  children,
  component,
  css,
  width,
  ...props
}) => {
  const {
    containerWidth,
    columns,
    size,
    gap,
    padding,
    gutter,
    colCss,
    colComponent,
    rowCss,
    rowComponent,
    contentAlignX,
  } = useGridContext(props)

  const context = {
    columns,
    size,
    gap,
    padding,
    gutter,
    colCss,
    colComponent,
    rowCss,
    rowComponent,
    contentAlignX,
  }

  const finalWidth = (() => {
    if (!width) return containerWidth
    if (typeof width === 'function') return width(containerWidth as Record<string, any>)
    return width
  })()

  const finalProps = {
    $coolgrid: {
      width: finalWidth,
      extraStyles: css,
    },
  }

  // Provide container context to descendant Row/Col components
  provide(ContainerContext, context)

  return (
    <Styled {...omitCtxKeys(props)} as={component} {...finalProps} {...DEV_PROPS}>
      {children}
    </Styled>
  )
}

const name = `${PKG_NAME}/Container`

Component.displayName = name
Component.pkgName = PKG_NAME
Component.PYREON__COMPONENT = name

export default Component
