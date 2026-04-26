import { splitProps, useContext } from '@pyreon/core'
import { __DEV__, PKG_NAME } from '../constants'
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

const DEV_PROPS: Record<string, string> = __DEV__ ? { 'data-coolgrid': 'col' } : {}

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

Component.displayName = name
Component.pkgName = PKG_NAME
Component.PYREON__COMPONENT = name

export default Component
