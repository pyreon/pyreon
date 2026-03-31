/**
 * Core building block of the elements package. Renders a three-section layout
 * (beforeContent / content / afterContent) inside a flex Wrapper. When only
 * content is present, the Wrapper inherits content-level alignment directly
 * to avoid an unnecessary nesting layer. Handles HTML-specific edge cases
 * like void elements (input, img) and inline elements (span, a) by
 * skipping children or switching sub-tags accordingly.
 */

import { onMount, splitProps } from '@pyreon/core'
import { render } from '@pyreon/ui-core'
import { PKG_NAME } from '../constants'
import { Content, Wrapper } from '../helpers'
import type { PyreonElement } from './types'
import { getShouldBeEmpty, isInlineElement } from './utils'

const equalize = (el: HTMLElement, direction: unknown) => {
  const beforeEl = el.firstElementChild as HTMLElement | null
  const afterEl = el.lastElementChild as HTMLElement | null

  if (beforeEl && afterEl && beforeEl !== afterEl) {
    const type: 'height' | 'width' = direction === 'rows' ? 'height' : 'width'
    const prop = type === 'height' ? 'offsetHeight' : 'offsetWidth'
    const beforeSize = beforeEl[prop]
    const afterSize = afterEl[prop]

    if (Number.isInteger(beforeSize) && Number.isInteger(afterSize)) {
      const maxSize = `${Math.max(beforeSize, afterSize)}px`
      beforeEl.style[type] = maxSize
      afterEl.style[type] = maxSize
    }
  }
}

const defaultDirection = 'inline'
const defaultContentDirection = 'rows'
const defaultAlignX = 'left'
const defaultAlignY = 'center'

const Component: PyreonElement = (props) => {
  const [own, rest] = splitProps(props, [
    'innerRef',
    'tag',
    'label',
    'content',
    'children',
    'beforeContent',
    'afterContent',
    'equalBeforeAfter',
    'block',
    'equalCols',
    'gap',
    'direction',
    'alignX',
    'alignY',
    'css',
    'contentCss',
    'beforeContentCss',
    'afterContentCss',
    'contentDirection',
    'contentAlignX',
    'contentAlignY',
    'beforeContentDirection',
    'beforeContentAlignX',
    'beforeContentAlignY',
    'afterContentDirection',
    'afterContentAlignX',
    'afterContentAlignY',
    'ref',
  ])

  const alignX = own.alignX ?? defaultAlignX
  const alignY = own.alignY ?? defaultAlignY
  const contentDirection = own.contentDirection ?? defaultContentDirection
  const contentAlignX = own.contentAlignX ?? defaultAlignX
  const contentAlignY = own.contentAlignY ?? defaultAlignY
  const beforeContentDirection = own.beforeContentDirection ?? defaultDirection
  const beforeContentAlignX = own.beforeContentAlignX ?? defaultAlignX
  const beforeContentAlignY = own.beforeContentAlignY ?? defaultAlignY
  const afterContentDirection = own.afterContentDirection ?? defaultDirection
  const afterContentAlignX = own.afterContentAlignX ?? defaultAlignX
  const afterContentAlignY = own.afterContentAlignY ?? defaultAlignY

  // --------------------------------------------------------
  // check if should render only single element
  // --------------------------------------------------------
  const shouldBeEmpty = !!rest.dangerouslySetInnerHTML || getShouldBeEmpty(own.tag)

  // --------------------------------------------------------
  // if not single element, calculate values
  // --------------------------------------------------------
  const isSimpleElement = !own.beforeContent && !own.afterContent
  const CHILDREN = own.children ?? own.content ?? own.label

  const isInline = isInlineElement(own.tag)
  const SUB_TAG = isInline ? 'span' : undefined

  // --------------------------------------------------------
  // direction & alignX & alignY calculations
  // --------------------------------------------------------
  let wrapperDirection: typeof own.direction = own.direction
  let wrapperAlignX: typeof alignX = alignX
  let wrapperAlignY: typeof alignY = alignY

  if (isSimpleElement) {
    if (contentDirection) wrapperDirection = contentDirection
    if (contentAlignX) wrapperAlignX = contentAlignX
    if (contentAlignY) wrapperAlignY = contentAlignY
  } else if (own.direction) {
    wrapperDirection = own.direction
  } else {
    wrapperDirection = defaultDirection
  }

  // --------------------------------------------------------
  // equalBeforeAfter: measure & equalize slot dimensions
  // --------------------------------------------------------
  let equalizeRef: HTMLElement | null = null
  const externalRef = own.ref ?? own.innerRef

  const mergedRef = (node: HTMLElement | null) => {
    equalizeRef = node
    if (typeof externalRef === 'function') externalRef(node)
    else if (externalRef != null) {
      ;(externalRef as unknown as { current: HTMLElement | null }).current = node
    }
  }

  if (own.equalBeforeAfter && own.beforeContent && own.afterContent) {
    onMount(() => {
      if (equalizeRef) equalize(equalizeRef, own.direction)
      return undefined
    })
  }

  // --------------------------------------------------------
  // common wrapper props
  // --------------------------------------------------------
  const WRAPPER_PROPS = {
    ref: mergedRef,
    extendCss: own.css,
    tag: own.tag,
    block: own.block,
    direction: wrapperDirection,
    alignX: wrapperAlignX,
    alignY: wrapperAlignY,
    as: undefined, // reset styled-components `as` prop
  }

  // --------------------------------------------------------
  // return simple/empty element like input or image etc.
  // --------------------------------------------------------
  if (shouldBeEmpty) {
    return <Wrapper {...rest} {...WRAPPER_PROPS} />
  }

  return (
    <Wrapper {...rest} {...WRAPPER_PROPS} isInline={isInline}>
      {own.beforeContent && (
        <Content
          tag={SUB_TAG}
          contentType="before"
          parentDirection={wrapperDirection}
          extendCss={own.beforeContentCss}
          direction={beforeContentDirection}
          alignX={beforeContentAlignX}
          alignY={beforeContentAlignY}
          equalCols={own.equalCols}
          gap={own.gap}
        >
          {own.beforeContent}
        </Content>
      )}

      {isSimpleElement ? (
        render(CHILDREN)
      ) : (
        <Content
          tag={SUB_TAG}
          contentType="content"
          parentDirection={wrapperDirection}
          extendCss={own.contentCss}
          direction={contentDirection}
          alignX={contentAlignX}
          alignY={contentAlignY}
          equalCols={own.equalCols}
        >
          {CHILDREN}
        </Content>
      )}

      {own.afterContent && (
        <Content
          tag={SUB_TAG}
          contentType="after"
          parentDirection={wrapperDirection}
          extendCss={own.afterContentCss}
          direction={afterContentDirection}
          alignX={afterContentAlignX}
          alignY={afterContentAlignY}
          equalCols={own.equalCols}
          gap={own.gap}
        >
          {own.afterContent}
        </Content>
      )}
    </Wrapper>
  )
}

const name = `${PKG_NAME}/Element` as const

Component.displayName = name
Component.pkgName = PKG_NAME
Component.PYREON__COMPONENT = name

export default Component
