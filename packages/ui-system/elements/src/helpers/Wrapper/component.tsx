/**
 * Wrapper component that serves as the outermost styled container for Element.
 * On web, it detects button/fieldset/legend tags and applies a two-layer flex
 * fix (parent + child Styled) because these HTML elements do not natively
 * support `display: flex` consistently across browsers.
 */
import { IS_DEVELOPMENT } from '../../utils'
import Styled from './styled'
import type { Props } from './types'
import { isWebFixNeeded } from './utils'

const DEV_PROPS: Record<string, string> = IS_DEVELOPMENT ? { 'data-pyr-element': 'Element' } : {}

const Component = ({
  children,
  tag,
  block,
  extendCss,
  direction,
  alignX,
  alignY,
  equalCols,
  isInline,
  ref,
  ...props
}: Partial<Props> & { ref?: any }) => {
  const COMMON_PROPS = {
    ...props,
    ...DEV_PROPS,
    ref,
    as: tag,
  }

  const needsFix = !props.dangerouslySetInnerHTML && isWebFixNeeded(tag)

  const normalElement = {
    block,
    direction,
    alignX,
    alignY,
    equalCols,
    extraStyles: extendCss,
  }

  const parentFixElement = {
    parentFix: true as const,
    block,
    extraStyles: extendCss,
  }

  const childFixElement = {
    childFix: true as const,
    direction,
    alignX,
    alignY,
    equalCols,
  }

  if (!needsFix) {
    return (
      <Styled {...COMMON_PROPS} $element={normalElement}>
        {children}
      </Styled>
    )
  }

  const asTag = isInline ? 'span' : 'div'

  return (
    <Styled {...COMMON_PROPS} $element={parentFixElement}>
      <Styled as={asTag} $childFix $element={childFixElement}>
        {children}
      </Styled>
    </Styled>
  )
}

export default Component
