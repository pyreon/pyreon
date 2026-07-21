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
import { resolveSlot } from '@pyreon/ui-core'
import { PKG_NAME } from '../constants'
import { Content, Wrapper } from '../helpers'
import { internElementBundle } from '../helpers/internElementBundle'
import WrapperStyled from '../helpers/Wrapper/styled'
import { isWebFixNeeded } from '../helpers/Wrapper/utils'
import { definePropsFromAccessors, hasGetterProps, IS_DEVELOPMENT } from '../utils'
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

const SLOT_KEYS = ['beforeContent', 'afterContent'] as const

// Layout / css keys that feed the styled-layer bundles (Wrapper / Content
// `$element`). When any is getter-shaped (compiler `_rp()` → getter — a
// signal-driven layout prop), the reactive path below keeps it LIVE instead
// of freezing it at its first value.
const LAYOUT_KEYS = [
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
] as const

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

  // ── Two-path reactive design ───────────────────────────────────────────
  // Getter-shaped props (compiler `_rp()` → getter via `makeReactiveProps`)
  // are the runtime signature of signal-driven props. Two tiers:
  //
  //  - `slotsReactive` (beforeContent / afterContent getter-shaped): slot
  //    EXISTENCE selects the render STRUCTURE (simple vs compound), so the
  //    whole body runs inside a reactive accessor — a flip re-selects the
  //    branch (structural re-mount, unavoidable when the DOM shape changes).
  //  - `layoutReactive` (any layout/css key getter-shaped): the render
  //    structure stays static; layout values are threaded as ACCESSORS into
  //    the styled layer (`$element` accessor / getter-shaped Wrapper +
  //    Content props), where the styler's class computed re-reads them
  //    TRACKED and swaps classList on change — SAME DOM element, no remount.
  //
  // NO getters (the dominant static case): the exact pre-existing fast
  // paths — interned bundles, one-shot render, zero perf change.
  const slotsReactive = hasGetterProps(own, SLOT_KEYS)
  const layoutReactive = slotsReactive || hasGetterProps(own, LAYOUT_KEYS)

  // Wrapper-level direction/alignX/alignY derivation — LIVE reads (each call
  // re-fires the prop getters), exact same conditional semantics as the old
  // eager consts.
  const computeWrapperLayout = (isSimple: boolean) => {
    const contentDirection = own.contentDirection ?? defaultContentDirection
    const contentAlignX = own.contentAlignX ?? defaultAlignX
    const contentAlignY = own.contentAlignY ?? defaultAlignY

    let direction: typeof own.direction = own.direction
    let alignX: NonNullable<typeof own.alignX> = own.alignX ?? defaultAlignX
    let alignY: NonNullable<typeof own.alignY> = own.alignY ?? defaultAlignY

    if (isSimple) {
      if (contentDirection) direction = contentDirection
      if (contentAlignX) alignX = contentAlignX
      if (contentAlignY) alignY = contentAlignY
    } else if (own.direction) {
      direction = own.direction
    } else {
      direction = defaultDirection
    }

    return { direction, alignX, alignY }
  }

  // Getter — preserves reactivity of own.content (which may be _rp() wrapped).
  // Reading own.content via ?? at setup would capture the value once.
  const getChildren = () => own.children ?? own.content ?? own.label

  // Slot resolution (component-vs-accessor discriminator) lives in
  // `@pyreon/ui-core` — see `resolveSlot` JSDoc for the full rationale.

  // Tag-derived gates are MOUNT-TIME by design (a reactive tag swap is
  // unsupported — see Text's `paragraph`/`tag` JSDoc for the contract).
  const isInline = isInlineElement(own.tag)
  const SUB_TAG = isInline ? 'span' : undefined

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

  // MOUNT-TIME feature gate (reads the slot getters once for the decision;
  // the equalize() body itself re-reads own.direction live per resize).
  if (own.equalBeforeAfter && own.beforeContent && own.afterContent) {
    // Run once on mount AND continue equalizing as the element resizes —
    // catches async slot content (font swaps, lazy text, viewport resize)
    // that a one-shot measurement would miss. Mirrors vitus-labs's Element
    // useLayoutEffect + ResizeObserver pattern.
    onMount(() => {
      const node = equalizeRef
      // Defensive null-guard: under the Pyreon mount pipeline `mergedRef`
      // always receives the wrapper node BEFORE onMount fires (proven by the
      // equalize/ResizeObserver mount tests, which observe a non-null node),
      // so `!node` is unreachable here. The guard protects against a future
      // where the Wrapper fails to forward the ref. Not reachable from a
      // happy-dom unit test.
      /* v8 ignore next */
      if (!node) return undefined

      equalize(node, own.direction)

      if (typeof ResizeObserver === 'undefined') return undefined
      const observer = new ResizeObserver(() => equalize(node, own.direction))
      observer.observe(node)
      return () => observer.disconnect()
    })
  }

  const buildBody = (): VNodeChildAtom => {
    // --------------------------------------------------------
    // check if should render only single element
    // --------------------------------------------------------
    const shouldBeEmpty = !!rest.dangerouslySetInnerHTML || getShouldBeEmpty(own.tag)

    // --------------------------------------------------------
    // if not single element, calculate values
    // --------------------------------------------------------
    // Under `slotsReactive` this body re-runs per slot flip, so the branch
    // selection below is re-evaluated with fresh slot reads.
    const isSimpleElement = !own.beforeContent && !own.afterContent

    const wrapperLayout = computeWrapperLayout(isSimpleElement)

    // --------------------------------------------------------
    // common wrapper props
    // --------------------------------------------------------
    // `layoutReactive` → the layout keys are ENUMERABLE GETTERS re-deriving
    // from the live prop getters per read; `mergeProps` / `splitProps` /
    // Wrapper's descriptor-preserving pipeline keep them live down to the
    // styler's class computed. Static case: the exact old plain object.
    const WRAPPER_PROPS = layoutReactive
      ? definePropsFromAccessors(
          {
            extendCss: () => own.css,
            block: () => own.block,
            direction: () => computeWrapperLayout(isSimpleElement).direction,
            alignX: () => computeWrapperLayout(isSimpleElement).alignX,
            alignY: () => computeWrapperLayout(isSimpleElement).alignY,
          },
          {
            ref: mergedRef,
            tag: own.tag,
            as: undefined, // reset styled-components `as` prop
          },
        )
      : {
          ref: mergedRef,
          extendCss: own.css,
          tag: own.tag,
          block: own.block,
          direction: wrapperLayout.direction,
          alignX: wrapperLayout.alignX,
          alignY: wrapperLayout.alignY,
          as: undefined, // reset styled-components `as` prop
        }

    // --------------------------------------------------------
    // return simple/empty element like input or image etc.
    // --------------------------------------------------------
    //
    // All four return paths below use `h(Comp, mergeProps(rest, ...))`
    // INSTEAD of JSX spread `<Comp {...rest} ...>`. The JSX automatic-runtime
    // lowers spread to `jsx(Comp, { ...rest, ... })` — that object literal is
    // evaluated at JS level and fires EVERY getter on `rest` before `jsx()`
    // ever sees it. Compiler-emitted reactive props (`_rp(() => signal())`
    // converted to getters by `makeReactiveProps`) survive the splitProps
    // call but die at the JSX spread. `mergeProps` (from `@pyreon/core`)
    // copies own descriptors via `Object.defineProperty`, then `h()` stores
    // the result as-is on the vnode (no copy) — getters survive end-to-end
    // into mount. (WRAPPER_PROPS rides as its OWN mergeProps source, never
    // object-spread into an override literal — a `{ ...WRAPPER_PROPS }`
    // spread would fire its getters and re-freeze the reactive layout path.)
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
      // `$element`: accessor when layout is reactive — the styler's
      // DynamicStyled reads a function-valued `$element` TRACKED inside its
      // class computed (same contract as $rocketstyle/$rocketstate) and
      // swaps classList on change; no remount, element identity preserved.
      // Static case: the interned plain bundle (elClassCache hits).
      const buildSimpleBundle = () => {
        const wl = computeWrapperLayout(true)
        return {
          block: own.block,
          direction: wl.direction,
          alignX: wl.alignX,
          alignY: wl.alignY,
          equalCols: own.equalCols,
          extraStyles: own.css,
        }
      }
      return h(
        WrapperStyled,
        mergeProps(rest as Record<string, unknown>, {
          ...WRAPPER_DEV_PROPS,
          ref: mergedRef,
          as: own.tag,
          $element: layoutReactive ? buildSimpleBundle : internElementBundle(buildSimpleBundle()),
          children: () => resolveSlot(getChildren()),
        }),
      )
    }

    if (isSimpleElement) {
      return h(
        Wrapper,
        mergeProps(rest as Record<string, unknown>, WRAPPER_PROPS, {
          isInline,
          children: () => resolveSlot(getChildren()),
        }),
      )
    }

    // Compound path — Content slot props are getter-shaped under
    // `layoutReactive` (Content detects them and passes its own `$element`
    // bundle as an accessor), plain values otherwise.
    const contentVNode = (
      contentType: 'before' | 'content' | 'after',
      accessors: Record<string, () => unknown>,
      children: () => VNodeChildAtom | VNodeChildAtom[],
    ): VNodeChildAtom => {
      const base: Record<string, unknown> = {
        tag: SUB_TAG,
        contentType,
        parentDirection: undefined,
        children,
      }
      const all: Record<string, () => unknown> = {
        parentDirection: () => computeWrapperLayout(isSimpleElement).direction,
        equalCols: () => own.equalCols,
        ...accessors,
      }
      if (layoutReactive) {
        return h(Content as ComponentFn, definePropsFromAccessors(all, base)) as VNodeChildAtom
      }
      for (const key of Object.keys(all)) base[key] = all[key]!()
      return h(Content as ComponentFn, base) as VNodeChildAtom
    }

    const compoundChildren: VNodeChildAtom[] = []
    if (own.beforeContent) {
      compoundChildren.push(
        contentVNode(
          'before',
          {
            extendCss: () => own.beforeContentCss,
            direction: () => own.beforeContentDirection ?? defaultDirection,
            alignX: () => own.beforeContentAlignX ?? defaultAlignX,
            alignY: () => own.beforeContentAlignY ?? defaultAlignY,
            gap: () => own.gap,
          },
          () => resolveSlot(own.beforeContent),
        ),
      )
    }
    compoundChildren.push(
      contentVNode(
        'content',
        {
          extendCss: () => own.contentCss,
          direction: () => own.contentDirection ?? defaultContentDirection,
          alignX: () => own.contentAlignX ?? defaultAlignX,
          alignY: () => own.contentAlignY ?? defaultAlignY,
        },
        () => resolveSlot(getChildren()),
      ),
    )
    if (own.afterContent) {
      compoundChildren.push(
        contentVNode(
          'after',
          {
            extendCss: () => own.afterContentCss,
            direction: () => own.afterContentDirection ?? defaultDirection,
            alignX: () => own.afterContentAlignX ?? defaultAlignX,
            alignY: () => own.afterContentAlignY ?? defaultAlignY,
            gap: () => own.gap,
          },
          () => resolveSlot(own.afterContent),
        ),
      )
    }

    return h(
      Wrapper,
      mergeProps(rest as Record<string, unknown>, WRAPPER_PROPS, {
        isInline,
        children: compoundChildren,
      }),
    )
  }

  // Slot existence is STRUCTURAL — when beforeContent/afterContent are
  // getter-shaped, the whole body is a reactive accessor so a flip
  // re-selects the simple/compound branch. Otherwise the body runs once
  // (the old one-shot shape, byte-equivalent for static props).
  return slotsReactive ? () => buildBody() : buildBody()
}

const name = `${PKG_NAME}/Element` as const

// PURE-form branding (sibling of the PURE-form nativeCompat sweep, #2368).
// A top-level `Component.x = y` assignment is an unremovable side effect the
// moment ANY binding of this module is used — it pinned EVERY component in
// this package into every consumer bundle (importing just <Portal> paid the
// whole 7.5KB gz of @pyreon/elements; measured: stripping these assignments
// took Portal-only to 2.36KB). `Object.assign` returns the SAME function
// (identity, call sites, stack traces unchanged); the PURE marker makes the
// branding droppable exactly when this component is unused.
export default /* @__PURE__ */ Object.assign(Component, {
  displayName: name,
  pkgName: PKG_NAME,
  PYREON__COMPONENT: name,
})
