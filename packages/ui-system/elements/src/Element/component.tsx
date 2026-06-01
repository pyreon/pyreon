/**
 * Core building block of the elements package. Renders a three-section layout
 * (beforeContent / content / afterContent) inside a flex Wrapper. When only
 * content is present, the Wrapper inherits content-level alignment directly
 * to avoid an unnecessary nesting layer. Handles HTML-specific edge cases
 * like void elements (input, img) and inline elements (span, a) by
 * skipping children or switching sub-tags accordingly.
 */

import { h, mergeProps, onMount, splitProps } from '@pyreon/core'
import type { ComponentFn, VNodeChildAtom } from '@pyreon/core'
import { render } from '@pyreon/ui-core'
import { PKG_NAME } from '../constants'
import { Content, Wrapper } from '../helpers'
import { internElementBundle } from '../helpers/internElementBundle'
import { isPyreonComponent } from '../helpers/isPyreonComponent'
import WrapperStyled from '../helpers/Wrapper/styled'
import { isWebFixNeeded } from '../helpers/Wrapper/utils'
import { IS_DEVELOPMENT } from '../utils'
import type { PyreonElement } from './types'
import { getShouldBeEmpty, isInlineElement } from './utils'

const WRAPPER_DEV_PROPS: Record<string, string> = IS_DEVELOPMENT
  ? { 'data-pyr-element': 'Element' }
  : {}

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
  // Getter — preserves reactivity of own.content (which may be _rp() wrapped).
  // Reading own.content via ?? at setup would capture the value once.
  const getChildren = () => own.children ?? own.content ?? own.label

  // Resolve a slot value INSIDE a reactive accessor. If the consumer passed a
  // function-returning-VNode (e.g. `content={() => <Icon name={signal()} />}`),
  // unwrap it by calling — its body's signal reads are then tracked by the
  // enclosing mountReactive effect, and the slot re-renders on signal change.
  // Static VNodes / strings / null pass through unchanged to `render()`.
  //
  // **Component vs accessor discriminator** —
  // `beforeContent={Header}` (component-reference shorthand) and
  // `content={() => <X />}` (reactive accessor) are BOTH `typeof === 'function'`.
  // Calling both bare crashes component shorthands the moment a
  // rocketstyle / attrs HOC runs `removeUndefinedProps(undefined)` on the
  // un-supplied props (`TypeError: Cannot convert undefined or null to object`).
  //
  // Discriminator: framework components carry one of two markers attached by
  // their factory:
  //   - `IS_ROCKETSTYLE` — anything `rocketstyle()` produces
  //   - `PYREON__COMPONENT` / `pkgName` — `@pyreon/elements` components
  //     (Element, Text, List, Portal, Overlay, Util)
  // Marked function → mount as `h(Component, null)` (no props, defaults
  // fill in via the HOC pipeline). Unmarked function → reactive accessor,
  // called bare so its return value (a VNode) renders. Bare-function
  // components without HOC wrapping (e.g. `const MyComp = () => <div />`)
  // also work via the accessor path — they're called with no args and
  // their VNode return goes through `render()` correctly. The marker
  // check ONLY rescues components that REQUIRE props to be defined.
  //
  // Return type is the RESOLVED atom (VNodeChildAtom | VNodeChildAtom[]) —
  // never a nested accessor — so the enclosing `() => resolveSlot(...)` IS
  // a valid VNodeChildAccessor in the JSX child position.
  const resolveSlot = (value: unknown): VNodeChildAtom | VNodeChildAtom[] => {
    if (typeof value === 'function') {
      if (isPyreonComponent(value)) {
        return h(value as ComponentFn, null) as VNodeChildAtom
      }
      return (value as () => VNodeChildAtom | VNodeChildAtom[])()
    }
    return render(value as Parameters<typeof render>[0]) as VNodeChildAtom | VNodeChildAtom[]
  }

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
    if (typeof externalRef === 'function') (externalRef as (el: HTMLElement | null) => void)(node)
    else if (externalRef != null) {
      ;(externalRef as unknown as { current: HTMLElement | null }).current = node
    }
  }

  if (own.equalBeforeAfter && own.beforeContent && own.afterContent) {
    // Run once on mount AND continue equalizing as the element resizes —
    // catches async slot content (font swaps, lazy text, viewport resize)
    // that a one-shot measurement would miss. Mirrors vitus-labs's Element
    // useLayoutEffect + ResizeObserver pattern.
    onMount(() => {
      const node = equalizeRef
      if (!node) return undefined

      equalize(node, own.direction)

      if (typeof ResizeObserver === 'undefined') return undefined
      const observer = new ResizeObserver(() => equalize(node, own.direction))
      observer.observe(node)
      return () => observer.disconnect()
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
  //
  // All four return paths below use `h(Comp, mergeProps(rest, {...}))`
  // INSTEAD of JSX spread `<Comp {...rest} ...>`. The JSX automatic-runtime
  // lowers spread to `jsx(Comp, { ...rest, ... })` — that object literal is
  // evaluated at JS level and fires EVERY getter on `rest` before `jsx()`
  // ever sees it. Compiler-emitted reactive props (`_rp(() => signal())`
  // converted to getters by `makeReactiveProps`) survive the splitProps
  // call but die at the JSX spread. `mergeProps` (from `@pyreon/core`)
  // copies own descriptors via `Object.defineProperty`, then `h()` stores
  // the result as-is on the vnode (no copy) — getters survive end-to-end
  // into mount.
  if (shouldBeEmpty) {
    return h(Wrapper, mergeProps(rest as Record<string, unknown>, WRAPPER_PROPS))
  }

  // Simple-Element fast path: no beforeContent / afterContent slots, and no
  // button/fieldset/legend two-layer flex fix needed. Inline the Wrapper
  // helper directly into a single Styled invocation — saves one component
  // hop, one splitProps call, and one mountChild per Element. The Wrapper
  // helper still exists for the rare needsFix case below; tests that asserted
  // Wrapper appears in the VNode tree are updated to the new shape.
  const dangerouslySetInnerHTML = (rest as { dangerouslySetInnerHTML?: unknown })
    .dangerouslySetInnerHTML
  const needsFix = !dangerouslySetInnerHTML && isWebFixNeeded(own.tag)

  // Children are passed via the mergeProps OVERRIDE (not as h's third
  // arg) for a critical reason: `mount.ts` merges `vnode.children` into
  // `vnode.props.children` via descriptor-preserving copy when (a)
  // vnode.children is non-empty AND (b) vnode.props.children is
  // undefined. Putting children into the override makes
  // `vnode.props.children !== undefined` so mount skips that step and
  // we keep a single descriptor-copy hop instead of two.
  if (isSimpleElement && !needsFix) {
    return h(
      WrapperStyled,
      mergeProps(rest as Record<string, unknown>, {
        ...WRAPPER_DEV_PROPS,
        ref: mergedRef,
        as: own.tag,
        $element: internElementBundle({
          block: own.block,
          direction: wrapperDirection,
          alignX: wrapperAlignX,
          alignY: wrapperAlignY,
          equalCols: own.equalCols,
          extraStyles: own.css,
        }),
        children: () => resolveSlot(getChildren()),
      }),
    )
  }

  if (isSimpleElement) {
    return h(
      Wrapper,
      mergeProps(rest as Record<string, unknown>, {
        ...WRAPPER_PROPS,
        isInline,
        children: () => resolveSlot(getChildren()),
      }),
    )
  }

  const compoundChildren: VNodeChildAtom[] = []
  if (own.beforeContent) {
    compoundChildren.push(
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
        {() => resolveSlot(own.beforeContent)}
      </Content>,
    )
  }
  compoundChildren.push(
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
      {() => resolveSlot(getChildren())}
    </Content>,
  )
  if (own.afterContent) {
    compoundChildren.push(
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
        {() => resolveSlot(own.afterContent)}
      </Content>,
    )
  }

  return h(
    Wrapper,
    mergeProps(rest as Record<string, unknown>, {
      ...WRAPPER_PROPS,
      isInline,
      children: compoundChildren,
    }),
  )
}

const name = `${PKG_NAME}/Element` as const

Component.displayName = name
Component.pkgName = PKG_NAME
Component.PYREON__COMPONENT = name

export default Component
