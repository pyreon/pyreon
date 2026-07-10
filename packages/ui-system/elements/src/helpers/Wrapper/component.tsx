/**
 * Wrapper component that serves as the outermost styled container for Element.
 * On web, it detects button/fieldset/legend tags and applies a two-layer flex
 * fix (parent + child Styled) because these HTML elements do not natively
 * support `display: flex` consistently across browsers.
 */
import { h, mergeProps, splitProps } from '@pyreon/core'
import { getShouldBeEmpty } from '../../Element/utils'
import { hasGetterProps, IS_DEVELOPMENT } from '../../utils'
import { internElementBundle } from '../internElementBundle'
import Styled from './styled'
import type { Props } from './types'
import { isWebFixNeeded } from './utils'

const DEV_PROPS: Record<string, string> = IS_DEVELOPMENT ? { 'data-pyr-element': 'Element' } : {}

/**
 * Why every `h(Styled, ...)` below uses canonical `mergeProps` from
 * `@pyreon/core` instead of JSX spread: the standard JSX automatic-
 * runtime compilation lowers `<Styled {...rest} foo={x}>` to roughly
 * `jsx(Styled, { ...rest, foo: x })`. That `{...rest, foo: x}` object
 * literal is evaluated at JS level — it fires every getter on `rest`
 * and stores the resolved value before `jsx()` ever sees the object.
 * No amount of in-runtime descriptor preservation can recover the
 * getters once they've been collapsed by the surface-level spread.
 *
 * `mergeProps` copies own property DESCRIPTORS via `Object.defineProperty`,
 * so compiler-emitted reactive props (`_rp(() => signal())` converted
 * to getters by `makeReactiveProps`) survive end-to-end with their
 * getter intact.
 *
 * Merge order at every call site (last source wins):
 *   rest ← DEV_PROPS ← { ref, as } ← extras
 */

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

// Layout keys feeding the `$element` bundles below. When any is
// getter-shaped (compiler `_rp()` → getter — a signal-driven layout prop),
// the bundle is passed as an ACCESSOR: the styler's DynamicStyled treats a
// function-valued `$element` as a reactive axis (same contract as
// $rocketstyle/$rocketstate) — it re-reads it TRACKED inside its class
// computed and swaps classList on change, on the SAME DOM element (no
// remount). Static layout (the dominant case) keeps the interned plain
// object — byte-identical resolution + elClassCache hits.
const LAYOUT_KEYS = ['block', 'direction', 'alignX', 'alignY', 'equalCols', 'extendCss'] as const

const Component = (props: Partial<Props> & { ref?: unknown }) => {
  const [own, rest] = splitProps(props, OWN_KEYS)

  const layoutReactive = hasGetterProps(own, LAYOUT_KEYS)

  // Defensive children gate: a getter-shaped `children` PROP (`children:
  // _rp(() => sig())`) read eagerly at the `children:` sites below would
  // freeze at its first value. Wrap in an accessor ONLY in that case —
  // static children (incl. the accessor-valued children Element already
  // passes, which are live by construction) keep today's zero-cost path
  // (no extra mountReactive hop per Wrapper).
  const childrenSlot = hasGetterProps(own, ['children'])
    ? () => own.children
    : own.children

  // Tag-derived gates are MOUNT-TIME by design (a reactive tag swap is
  // unsupported — it would mean unmounting one DOM element and mounting
  // another; see Text's `paragraph`/`tag` JSDoc for the same contract).
  const needsFix = !own.dangerouslySetInnerHTML && isWebFixNeeded(own.tag)

  // Void HTML elements (hr, input, img, br, …) cannot have children. Even
  // a falsy `{own.children}` slot becomes `[undefined]` in the vnode and
  // trips runtime-dom's void-element warning. Element already skips passing
  // children to Wrapper for void tags; this guard makes sure the empty
  // slot is dropped here too instead of leaking into the JSX.
  const isVoidTag = !own.dangerouslySetInnerHTML && getShouldBeEmpty(own.tag)

  // dangerouslySetInnerHTML and children are mutually exclusive — both
  // become inner content (per `runtime-server/src/index.ts:228` and
  // `runtime-dom/src/props.ts:289`). Pre-fix the prop was in OWN_KEYS,
  // moved into `own` by splitProps, and never re-attached to the rendered
  // vnode — so `<Logo dangerouslySetInnerHTML={...} />` rendered an empty
  // <div></div>. Forward the prop to the styled vnode and drop the
  // children slot when innerHTML is set.
  const innerHTML = own.dangerouslySetInnerHTML

  if (!needsFix) {
    const bundle = layoutReactive
      ? () => ({
          block: own.block,
          direction: own.direction,
          alignX: own.alignX,
          alignY: own.alignY,
          equalCols: own.equalCols,
          extraStyles: own.extendCss,
        })
      : internElementBundle({
          block: own.block,
          direction: own.direction,
          alignX: own.alignX,
          alignY: own.alignY,
          equalCols: own.equalCols,
          extraStyles: own.extendCss,
        })
    if (isVoidTag) {
      return h(
        Styled,
        mergeProps(rest as unknown as Record<string, unknown>, DEV_PROPS, {
          ref: own.ref,
          as: own.tag,
          $element: bundle,
        }),
      )
    }
    if (innerHTML) {
      return h(
        Styled,
        mergeProps(rest as unknown as Record<string, unknown>, DEV_PROPS, {
          ref: own.ref,
          as: own.tag,
          $element: bundle,
          dangerouslySetInnerHTML: innerHTML,
        }),
      )
    }
    return h(
      Styled,
      mergeProps(rest as unknown as Record<string, unknown>, DEV_PROPS, {
        ref: own.ref,
        as: own.tag,
        $element: bundle,
        children: childrenSlot,
      }),
    )
  }

  const asTag = own.isInline ? 'span' : 'div'
  const parentBundle = layoutReactive
    ? () => ({
        parentFix: true as const,
        block: own.block,
        extraStyles: own.extendCss,
      })
    : internElementBundle({
        parentFix: true as const,
        block: own.block,
        extraStyles: own.extendCss,
      })
  const childBundle = layoutReactive
    ? () => ({
        childFix: true as const,
        direction: own.direction,
        alignX: own.alignX,
        alignY: own.alignY,
        equalCols: own.equalCols,
      })
    : internElementBundle({
        childFix: true as const,
        direction: own.direction,
        alignX: own.alignX,
        alignY: own.alignY,
        equalCols: own.equalCols,
      })

  // needsFix path: innerHTML belongs on the INNER styled node (where the
  // actual content lives), NOT on the outer flex-fix wrapper. The
  // `needsFix` computation already excludes the innerHTML case
  // (`!own.dangerouslySetInnerHTML && isWebFixNeeded(own.tag)`), so this
  // branch normally won't execute when innerHTML is set — but we keep
  // the defensive forwarding so the contract is robust against future
  // refactors of the needsFix gate.
  //
  // Coverage: provably dead under the current gate — `needsFix === true`
  // implies `!own.dangerouslySetInnerHTML`, so `innerHTML` is always falsy
  // here (see Wrapper-innerhtml.test.tsx "forwards … on the needsFix path",
  // which proves a button + innerHTML takes the !needsFix path instead).
  // Kept as a defensive guard against a future needsFix-gate refactor.
  /* v8 ignore start */
  if (innerHTML) {
    return h(
      Styled,
      mergeProps(rest as unknown as Record<string, unknown>, DEV_PROPS, {
        ref: own.ref,
        as: own.tag,
        $element: parentBundle,
        children: h(Styled, {
          as: asTag,
          $childFix: true,
          $element: childBundle,
          dangerouslySetInnerHTML: innerHTML,
        }),
      }),
    )
  }
  /* v8 ignore stop */

  return h(
    Styled,
    mergeProps(rest as unknown as Record<string, unknown>, DEV_PROPS, {
      ref: own.ref,
      as: own.tag,
      $element: parentBundle,
      children: h(Styled, {
        as: asTag,
        $childFix: true,
        $element: childBundle,
        children: childrenSlot,
      }),
    }),
  )
}

export default Component
