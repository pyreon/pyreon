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
import { hasGetterProps } from '../utils'
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
   *
   * **Static by design** (mount-time): together with `tag` this selects the
   * rendered HTML TAG, and a tag swap means unmounting one DOM element and
   * mounting a different one — the styled layer applies `as` once per mount
   * (a reactive tag swap is architecturally unsupported across the styler
   * pipeline). A signal-driven `paragraph` is read at setup only; re-mount
   * the component (e.g. via `<Show>`) to change the tag.
   */
  paragraph: boolean
  /**
   * Defines what kind of HTML tag should be rendered
   *
   * **Static by design** (mount-time) — see `paragraph`.
   */
  tag: HTMLTextTags
  /**
   * If an additional styling needs to be added, it can be do so via injecting styles using this property.
   *
   * Reactive: a signal-driven `css` re-resolves the injected styles when the
   * signal changes (class swap on the same DOM element, no remount).
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
  // vitus-labs `804dd0e2`. MOUNT-TIME read by design (see the Props JSDoc):
  // the rendered tag cannot swap reactively.
  const finalTag = own.paragraph ? 'p' : own.tag

  // Reactive `css`: when getter-shaped (compiler `_rp()` → getter), pass
  // `$text` as an ACCESSOR — the styler's DynamicStyled treats a
  // function-valued `$text` as a reactive axis (same contract as
  // $rocketstyle/$rocketstate/$element): it re-reads it TRACKED inside its
  // class computed and swaps classList on change, no remount. Static css
  // (the dominant case) keeps the plain object — byte-identical resolution
  // + elClassCache behavior.
  const $text = hasGetterProps(own, ['css'])
    ? () => ({ extraStyles: own.css })
    : { extraStyles: own.css }

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
      $text,
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
