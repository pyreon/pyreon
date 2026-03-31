/**
 * Text component for rendering inline or block-level text. Supports a
 * `paragraph` shorthand that automatically renders as a `<p>` tag, or
 * a custom `tag` for semantic HTML (h1-h6, span, etc.). Marked with
 * a static `isText` flag so other components can detect text children.
 */

import { splitProps } from '@pyreon/core'
import type { PyreonHTMLAttributes, VNodeChild } from '@pyreon/core'
import type { HTMLTextTags } from '@pyreon/ui-core'
import { PKG_NAME } from '../constants'
import type { ExtendCss, PyreonComponent } from '../types'
import Styled from './styled'

export type Props = Partial<{
  /**
   * Label can be used instead of children for inline syntax. But **children** prop takes a precedence
   */
  label: VNodeChild
  /**
   * Children to be rendered within **Text** component.
   */
  children: VNodeChild
  /**
   * Defines whether should behave as a block text element. Automatically adds **p** HTML tag
   */
  paragraph: boolean
  /**
   * Defines what kind of HTML tag should be rendered
   */
  tag: HTMLTextTags
  /**
   * If an additional styling needs to be added, it can be do so via injecting styles using this property.
   */
  css: ExtendCss
}> &
  PyreonHTMLAttributes

const Component: PyreonComponent<Props> & {
  isText?: true
} = (props) => {
  const [own, rest] = splitProps(props, ['paragraph', 'label', 'children', 'tag', 'css', 'ref'])

  let finalTag: string | undefined

  if (own.paragraph) finalTag = 'p'
  else {
    finalTag = own.tag
  }

  return (
    <Styled ref={own.ref} as={finalTag} $text={{ extraStyles: own.css }} {...rest}>
      {own.children ?? own.label}
    </Styled>
  )
}

// ----------------------------------------------
// DEFINE STATICS
// ----------------------------------------------
const name = `${PKG_NAME}/Text` as const

Component.displayName = name
Component.pkgName = PKG_NAME
Component.PYREON__COMPONENT = name
Component.isText = true

export default Component
