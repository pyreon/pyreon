/**
 * Content area used inside Element to render one of the three
 * layout slots (before, content, after). Passes alignment, direction,
 * gap, and equalCols styling props to the underlying styled component.
 * Adds a `data-pyr-element` attribute in development for debugging.
 *
 * Children are rendered via core `render()`.
 */
import { splitProps } from '@pyreon/core'
import { render } from '@pyreon/ui-core'
import { IS_DEVELOPMENT } from '../../utils'
import Styled from './styled'
import type { Props } from './types'

const Component = (props: Partial<Props>) => {
  const [own, rest] = splitProps(props, [
    'contentType',
    'tag',
    'parentDirection',
    'direction',
    'alignX',
    'alignY',
    'equalCols',
    'gap',
    'extendCss',
    'children',
  ])

  const debugProps = IS_DEVELOPMENT
    ? {
        'data-pyr-element': own.contentType,
      }
    : {}

  const stylingProps = {
    contentType: own.contentType,
    parentDirection: own.parentDirection,
    direction: own.direction,
    alignX: own.alignX,
    alignY: own.alignY,
    equalCols: own.equalCols,
    gap: own.gap,
    extraStyles: own.extendCss,
  }

  return (
    <Styled as={own.tag} $contentType={own.contentType} $element={stylingProps} {...debugProps} {...rest}>
      {render(own.children)}
    </Styled>
  )
}

export default Component
