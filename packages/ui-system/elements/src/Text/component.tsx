/**
 * Text component for rendering inline or block-level text. Supports a
 * `paragraph` shorthand that automatically renders as a `<p>` tag, or
 * a custom `tag` for semantic HTML (h1-h6, span, etc.). Marked with
 * a static `isText` flag so other components can detect text children.
 */

import { h, mergeProps, splitProps } from '@pyreon/core'
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

  // `paragraph` shorthand maps to <p>; otherwise pass through `tag`. Ternary
  // form replaces the prior `let finalTag` + if/else block — V8 prefers the
  // single-assignment shape for inline-cache stability. Ported from
  // vitus-labs `804dd0e2`.
  const finalTag = own.paragraph ? 'p' : own.tag

  // Use `h(Styled, mergeProps(rest, {..., children}))` instead of JSX
  // spread `<Styled ... {...rest}>` so compiler-emitted reactive props
  // (`_rp()` converted to getters by `makeReactiveProps`) survive
  // end-to-end. JSX spread fires every getter at the JS object-literal
  // layer; `mergeProps` from `@pyreon/core` preserves getters via
  // descriptor copy.
  //
  // Children go into the mergeProps override (not h's third arg) so
  // mount's children-merge step skips this vnode — one descriptor-copy
  // hop instead of two.
  //
  // `children` is an ACCESSOR (`() => …`), not the eagerly-read value —
  // otherwise `own.label` (a compiler `_rp()`-getter for a signal-driven
  // `label={sig()}`) would be captured once at setup and never re-read,
  // so the text would not update when the signal changes. The accessor
  // lets `mountChild` mount it via `mountReactive`, re-reading
  // `own.children`/`own.label` on each change. Mirrors Element's
  // `getChildren` (Element/component.tsx). #1168 fixed the rest-prop
  // boundary but left this children read eager.
  return h(
    Styled,
    mergeProps(rest as Record<string, unknown>, {
      ref: own.ref,
      as: finalTag,
      $text: { extraStyles: own.css },
      children: () => own.children ?? own.label,
    }),
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
