import { nativeCompat, provide, splitProps } from '@pyreon/core'
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

/* v8 ignore next — production branch not exercised in tests */
const DEV_PROPS: Record<string, string> = process.env.NODE_ENV !== 'production' ? { 'data-coolgrid': 'container' } : {}

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

// Mark as native — compat-mode jsx() runtimes skip wrapCompatComponent so
// Container's provide(ContainerContext, ...) reaches descendant Row/Col.

// ASSIGNMENT + /* @__PURE__ */ form (not a bare statement): inside a built
// lib's shared chunk a bare `nativeCompat(X)` call is an unremovable side
// effect that RETAINS the component body in every consumer bundle that
// never imports it (see runtime-dom's native-compat-treeshake lock). The
// PURE call is droppable exactly when the export is unused; when used it
// returns the SAME fn with the marker applied.
export default /* @__PURE__ */ nativeCompat(Component)