import { provide, splitProps } from '@pyreon/core'
import { __DEV__, PKG_NAME } from '../constants'
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

const DEV_PROPS: Record<string, string> = __DEV__ ? { 'data-coolgrid': 'container' } : {}

const Component: ElementType<['containerWidth']> = (props) => {
  const [own, rest] = splitProps(props, ['children', 'component', 'css', 'width'])
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
  } = useGridContext(rest)

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
    if (!own.width) return containerWidth
    if (typeof own.width === 'function') return own.width(containerWidth as Record<string, any>)
    return own.width
  })()

  const finalProps = {
    $coolgrid: {
      width: finalWidth,
      extraStyles: own.css,
    },
  }

  // Provide container context to descendant Row/Col components
  provide(ContainerContext, context)

  return (
    <Styled {...omitCtxKeys(rest)} as={own.component} {...finalProps} {...DEV_PROPS}>
      {own.children}
    </Styled>
  )
}

const name = `${PKG_NAME}/Container`

Component.displayName = name
Component.pkgName = PKG_NAME
Component.PYREON__COMPONENT = name

export default Component
