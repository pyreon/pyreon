/**
 * List component that combines Iterator (data-driven rendering) with an
 * optional Element root wrapper. When `rootElement` is false (default),
 * it renders a bare Iterator as a fragment. When true, the Iterator output
 * is wrapped in an Element that receives all non-iterator props (e.g.,
 * layout, alignment, css), allowing the list to be styled as a single block.
 */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { h, mergeProps, splitProps } from '@pyreon/core'
import { omit, pick } from '@pyreon/ui-core'
import { PKG_NAME } from '../constants'
import type { ElementProps } from '../Element'
import { Element } from '../Element'
import type {
  ChildrenProps as IteratorChildrenProps,
  LooseProps as IteratorLooseProps,
  ObjectProps as IteratorObjectProps,
  Props as IteratorProps,
  SimpleProps as IteratorSimpleProps,
  ObjectValue,
  SimpleValue,
} from '../helpers/Iterator'
import Iterator from '../helpers/Iterator'
import type { MergeTypes } from '../types'

type ListOnly = {
  /**
   * A boolean value. When set to `false`, component returns fragment.
   * When set to `true`, component returns as the **root** element `Element`
   * component.
   */
  rootElement?: boolean
  /**
   * Label prop from `Element` component is being ignored.
   */
  label?: never
  /**
   * Content prop from `Element` component is being ignored.
   */
  content?: never
}

/**
 * Props that List accepts on top of the Iterator branch — the Element prop
 * surface (so `tag`, `direction`, `alignX`, etc. forward when
 * `rootElement` is true) plus the List-only toggle.
 */
type ListExtras = Partial<Omit<ElementProps, 'children' | 'content' | 'label'>> & ListOnly

/**
 * Public Props — generic over the data element type so callers get the same
 * inference Iterator does, plus the List-specific `rootElement` toggle and
 * Element prop forwarding.
 *
 *   Props<string>          → SimpleProps & ListExtras  (valueName REQUIRED)
 *   Props<{ id; name }>    → ObjectProps & ListExtras  (valueName FORBIDDEN)
 *   Props<unknown> / Props → LooseProps & ListExtras   (today's behavior)
 */
export type Props<T = unknown> = MergeTypes<[IteratorProps<T>, ListExtras]>

// Internal spread — runtime is correct, but the picked subset can't satisfy
// any specific Iterator overload statically (which is good — the public
// overloads enforce constraints). Cast Iterator to a loose callable for
// the internal forwarding only; public consumers still see the strict
// overloaded interface.
const LooseIterator = Iterator as unknown as (props: IteratorLooseProps) => VNodeChild

const Component = (allProps: IteratorLooseProps & ListExtras) => {
  const [own, props] = splitProps(allProps as Record<string, unknown>, ['rootElement', 'ref'])

  // `h(Comp, descriptorPreservingProps)` INSTEAD of JSX spread
  // (`<LooseIterator {...pick(...)} />` / `<Element {...omit(...)}>`): the
  // automatic JSX runtime lowers a spread to `jsx(Comp, { ...src })` — that
  // object literal is evaluated at JS level and fires EVERY getter on the
  // source before `jsx()` ever sees it, collapsing compiler-emitted reactive
  // props (`_rp(() => signal())` → getters via `makeReactiveProps`) to frozen
  // snapshots. `pick` / `omit` (ui-core) are descriptor-copying, so their
  // RESULTS carry live getters — passing them to `h()` directly (which stores
  // props as-is on the vnode) keeps the getters alive end-to-end. Same fix
  // shape Element / Text / Content / Wrapper already carry.
  //
  // Children go into the mergeProps override (not h's third arg) so mount's
  // children-merge step short-circuits — one descriptor-copy hop, mirroring
  // Element's four return paths.
  const renderedList = h(
    LooseIterator as ComponentFn,
    pick(props, Iterator.RESERVED_PROPS) as Record<string, unknown>,
  )

  if (!own.rootElement) return renderedList

  return h(
    Element as unknown as ComponentFn,
    mergeProps(omit(props, Iterator.RESERVED_PROPS) as Record<string, unknown>, {
      ref: own.ref as ElementProps['ref'],
      children: renderedList,
    }),
  )
}

const name = `${PKG_NAME}/List` as const


// ---------------------------------------------------------------------------
// Public callable type — same overload pattern as Iterator so JSX-site
// inference flows through without callers having to spell out `<T>`.
// ---------------------------------------------------------------------------
export interface ListComponent {
  // T inferred from `data`. Order: SimpleProps, ObjectProps, ChildrenProps,
  // then a LooseProps fallback for forwarding patterns where derived
  // `$$types['data']` is a wide union that doesn't bind to any narrow
  // overload. See Iterator's IteratorComponent for the full rationale.
  <T extends SimpleValue>(props: IteratorSimpleProps<T> & ListExtras): VNodeChild
  <T extends ObjectValue>(props: IteratorObjectProps<T> & ListExtras): VNodeChild
  (props: IteratorChildrenProps & ListExtras): VNodeChild
  (props: IteratorLooseProps & ListExtras): VNodeChild
  displayName?: string
  pkgName?: string
  PYREON__COMPONENT?: string
}

// PURE-form branding — a bare top-level `(Component as …).x = y` assignment is
// an unremovable side effect that pinned every component in this package into
// every consumer bundle (see Portal/component.tsx for the measurement).
export default /* @__PURE__ */ Object.assign(Component, {
  displayName: name,
  pkgName: PKG_NAME,
  PYREON__COMPONENT: name,
}) as unknown as ListComponent
