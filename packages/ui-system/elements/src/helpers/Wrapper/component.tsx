/**
 * Wrapper component that serves as the outermost styled container for Element.
 * On web, it detects button/fieldset/legend tags and applies a two-layer flex
 * fix (parent + child Styled) because these HTML elements do not natively
 * support `display: flex` consistently across browsers.
 */
import { splitProps } from '@pyreon/core'
import { getShouldBeEmpty } from '../../Element/utils'
import { IS_DEVELOPMENT } from '../../utils'
import { internElementBundle } from '../internElementBundle'
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

  // Void HTML elements (hr, input, img, br, …) cannot have children. Even
  // a falsy `{own.children}` slot becomes `[undefined]` in the vnode and
  // trips runtime-dom's void-element warning. Element already skips passing
  // children to Wrapper for void tags; this guard makes sure the empty
  // slot is dropped here too instead of leaking into the JSX.
  const isVoidTag = !own.dangerouslySetInnerHTML && getShouldBeEmpty(own.tag)

  if (!needsFix) {
    const bundle = internElementBundle({
      block: own.block,
      direction: own.direction,
      alignX: own.alignX,
      alignY: own.alignY,
      equalCols: own.equalCols,
      extraStyles: own.extendCss,
    })
    if (isVoidTag) {
      return <Styled {...commonProps} $element={bundle} />
    }
    return (
      <Styled {...commonProps} $element={bundle}>
        {own.children}
      </Styled>
    )
  }

  const asTag = own.isInline ? 'span' : 'div'
  const parentBundle = internElementBundle({
    parentFix: true as const,
    block: own.block,
    extraStyles: own.extendCss,
  })
  const childBundle = internElementBundle({
    childFix: true as const,
    direction: own.direction,
    alignX: own.alignX,
    alignY: own.alignY,
    equalCols: own.equalCols,
  })

  return (
    <Styled {...commonProps} $element={parentBundle}>
      <Styled as={asTag} $childFix $element={childBundle}>
        {own.children}
      </Styled>
    </Styled>
  )
}

export default Component
