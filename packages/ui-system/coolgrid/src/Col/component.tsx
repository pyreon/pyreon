import { splitProps, useContext } from '@pyreon/core'
import { PKG_NAME } from '../constants'
import { RowContext } from '../context'
import type { ElementType } from '../types'
import useGridContext from '../useContext'
import { omitCtxKeys } from '../utils'
import Styled from './styled'

/**
 * Col (column) component that reads grid settings from RowContext
 * (columns, gap, gutter) and calculates its own width as a fraction
 * of the total columns. Supports responsive size, padding, and visibility.
 */

/* v8 ignore next — production branch not exercised in tests */
const DEV_PROPS: Record<string, string> = process.env.NODE_ENV !== 'production' ? { 'data-coolgrid': 'col' } : {}

const Component: ElementType<
  [
    'containerWidth',
    'width',
    'rowComponent',
    'rowCss',
    'colCss',
    'colComponent',
    'columns',
    'gap',
    'gutter',
    'contentAlignX',
  ]
> = (props) => {
  const [own, rest] = splitProps(props, ['children', 'component', 'css'])
  const parentCtx = useContext(RowContext)
  const { colCss, colComponent, columns, gap, size, padding } = useGridContext({
    ...parentCtx,
    ...rest,
  })

  const finalProps = {
    $coolgrid: {
      columns,
      gap,
      size,
      padding,
      extraStyles: own.css ?? colCss,
    },
  }

  return (
    <Styled {...omitCtxKeys(rest)} as={own.component ?? colComponent} {...finalProps} {...DEV_PROPS}>
      {own.children}
    </Styled>
  )
}

const name = `${PKG_NAME}/Col`


// Branding rides the PURE export expression — a bare top-level
// `Component.x = y` assignment is an unremovable side effect that pins every
// component in the package into every consumer bundle (measured on
// @pyreon/elements: importing just <Portal> paid the whole 7.5KB gz; PR ref
// in elements/src/Portal/component.tsx).
export default /* @__PURE__ */ Object.assign(Component, {
  displayName: name,
  pkgName: PKG_NAME,
  PYREON__COMPONENT: name,
})
