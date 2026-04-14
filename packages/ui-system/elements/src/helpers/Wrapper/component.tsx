/**
 * Wrapper component that serves as the outermost styled container for Element.
 * On web, it detects button/fieldset/legend tags and applies a two-layer flex
 * fix (parent + child Styled) because these HTML elements do not natively
 * support `display: flex` consistently across browsers.
 */
import { splitProps } from '@pyreon/core'
import { IS_DEVELOPMENT } from '../../utils'
import Styled from './styled'
import type { Props } from './types'
import { isWebFixNeeded } from './utils'

const DEV_PROPS: Record<string, string> = IS_DEVELOPMENT ? { 'data-pyr-element': 'Element' } : {}

// Layout / ref keys consumed by Wrapper itself. Everything else is forwarded
// onto the underlying DOM node. Listed as a tuple so `splitProps` narrows
// `own` correctly while preserving reactive prop tracking on both halves.
const OWN_KEYS: Array<keyof Props | 'ref'> = [
  'children',
  'tag',
  'block',
  'extendCss',
  'direction',
  'alignX',
  'alignY',
  'equalCols',
  'isInline',
  'ref',
  'dangerouslySetInnerHTML',
]

const Component = (props: Partial<Props> & { ref?: unknown }) => {
  const [own, rest] = splitProps(props, OWN_KEYS)

  const commonProps = {
    ...rest,
    ...DEV_PROPS,
    ref: own.ref,
    as: own.tag,
  }

  const needsFix = !own.dangerouslySetInnerHTML && isWebFixNeeded(own.tag)

  if (!needsFix) {
    return (
      <Styled
        {...commonProps}
        $element={{
          block: own.block,
          direction: own.direction,
          alignX: own.alignX,
          alignY: own.alignY,
          equalCols: own.equalCols,
          extraStyles: own.extendCss,
        }}
      >
        {own.children}
      </Styled>
    )
  }

  const asTag = own.isInline ? 'span' : 'div'

  return (
    <Styled
      {...commonProps}
      $element={{
        parentFix: true as const,
        block: own.block,
        extraStyles: own.extendCss,
      }}
    >
      <Styled
        as={asTag}
        $childFix
        $element={{
          childFix: true as const,
          direction: own.direction,
          alignX: own.alignX,
          alignY: own.alignY,
          equalCols: own.equalCols,
        }}
      >
        {own.children}
      </Styled>
    </Styled>
  )
}

export default Component
