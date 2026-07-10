/**
 * Data-driven list renderer that supports three input modes: children,
 * an array of primitives, or an array of objects.
 * Each item receives positional metadata (first, last, odd, even, position)
 * and optional injected props via `itemProps`. Items can be individually
 * wrapped with `wrapComponent`. Children always take priority over the
 * component+data prop pattern.
 */

import type { VNode, VNodeChild } from '@pyreon/core'
import { Fragment } from '@pyreon/core'
import { isEmpty, render } from '@pyreon/ui-core'
import { hasGetterProps } from '../../utils'
import type {
  ChildrenProps,
  ExtendedProps,
  LooseProps,
  ObjectProps,
  ObjectValue,
  SimpleProps,
  SimpleValue,
} from './types'

type ClassifiedData =
  | { type: 'simple'; data: SimpleValue[] }
  | { type: 'complex'; data: ObjectValue[] }
  | null

const classifyData = (data: unknown[]): ClassifiedData => {
  const items = data.filter(
    (item) =>
      item != null && !(typeof item === 'object' && isEmpty(item as Record<string, unknown>)),
  )

  if (items.length === 0) return null

  let isSimple = true
  let isComplex = true

  for (const item of items) {
    if (typeof item === 'string' || typeof item === 'number') {
      isComplex = false
    } else if (typeof item === 'object') {
      isSimple = false
    } else {
      isSimple = false
      isComplex = false
    }
  }

  if (isSimple) return { type: 'simple', data: items as SimpleValue[] }
  if (isComplex) return { type: 'complex', data: items as ObjectValue[] }
  return null
}

const RESERVED_PROPS = [
  'children',
  'component',
  'wrapComponent',
  'data',
  'itemKey',
  'valueName',
  'itemProps',
  'wrapProps',
] as const

type AttachItemProps = ({ i, length }: { i: number; length: number }) => ExtendedProps

const attachItemProps: AttachItemProps = ({ i, length }: { i: number; length: number }) => {
  const position = i + 1

  return {
    index: i,
    first: position === 1,
    last: position === length,
    odd: position % 2 === 1,
    even: position % 2 === 0,
    position,
  }
}

const Component = (props: LooseProps) => {
  // ── Two-path reactive gate ─────────────────────────────────────────────
  // A getter-shaped RESERVED prop (`data={items()}` compiled to `_rp(() =>
  // items())` → getter via `makeReactiveProps`) or a function-valued
  // `children` (the compiler's `() => x.children` accessor wrap, which can
  // read signals) means the list must RE-RENDER when the underlying signals
  // change. Pre-fix, the full body destructure fired every getter ONCE and
  // `return renderItems()` was a one-shot — `<List data={items()}
  // component={Row}/>` rendered the initial array and never updated.
  //
  // Static case (no getters, non-function children — the dominant shape):
  // `renderBody()` is invoked once at setup, byte-equivalent to the old
  // body. Reactive case: the body runs inside a `mountReactive` effect via
  // the returned accessor — every prop read (the destructure below runs
  // PER RUN) is tracked, so a signal flip re-renders the list.
  //
  // Re-render semantics are WHOLE-LIST REPLACEMENT (Iterator items carry no
  // vnode keys — see the renderChild note below): correct, never-stale; for
  // large lists with surgical keyed reconciliation use `<For by={...}>`.
  const reactive = hasGetterProps(props, RESERVED_PROPS) || typeof props.children === 'function'

  const renderBody = (): VNodeChild => {
    const {
      itemKey,
      valueName,
      children: rawChildren,
      component,
      data,
      wrapComponent: Wrapper,
      wrapProps,
      itemProps,
    } = props

    // Unwrap the Pyreon compiler's `() => x` accessor wrap. When the parent
    // emits `<Iterator>{items}</Iterator>` and the compiler-emitted form is
    // `Iterator({ children: () => items })`, the downstream `Array.isArray`
    // check returns false, the Fragment check returns false (function is not
    // an object), and the fallthrough `renderChild(function)` calls
    // `render(function, props)` which interprets the function as a component
    // function — wrong shape, lost per-item metadata. Resolving INSIDE the
    // body (per run, so a signal-reading thunk is re-read reactively — the
    // eager-at-setup unwrap froze it) keeps every downstream branch correct.
    // Mirrors the kinetic Stagger / TransitionItem fix.
    const children = typeof rawChildren === 'function'
      ? (rawChildren as () => VNodeChild)()
      : rawChildren

    const injectItemProps = typeof itemProps === 'function' ? itemProps : () => itemProps

    const injectWrapItemProps = typeof wrapProps === 'function' ? wrapProps : () => wrapProps

    const getKey = (item: string | number, index: number) => {
      if (typeof itemKey === 'function') return itemKey(item, index)
      return index
    }

    const renderChild = (child: VNodeChild, total = 1, i = 0) => {
      if (!itemProps && !Wrapper) return child

      const extendedProps = attachItemProps({
        i,
        length: total,
      })

      const finalItemProps = itemProps ? injectItemProps({}, extendedProps) : {}

      if (Wrapper) {
        const finalWrapProps = wrapProps ? injectWrapItemProps({}, extendedProps) : {}

        // NO `key` on the wrapper vnode (removed alongside the reactive-body
        // fix): a fully-keyed array returned from the reactive accessor routes
        // to `mountKeyedList`, which NEVER re-renders an entry whose key
        // survives — with the old index keys a data flip left every row
        // FROZEN. Iterator rows bake plain props (no per-row signals), so
        // whole-list replacement is the only correct reactive semantic. The
        // static path never used the keys (`mountChildren` is positional).
        return <Wrapper {...finalWrapProps}>{render(child, finalItemProps)}</Wrapper>
      }

      return render(child, {
        key: i,
        ...finalItemProps,
      })
    }

    // --------------------------------------------------------
    // render children
    // --------------------------------------------------------
    const renderChildren = () => {
      // Defensive: `renderChildren` is only invoked from `renderItems` behind
      // `if (children) return renderChildren()`, so `children` is always truthy
      // here and this guard is unreachable via the public Iterator() API. Kept
      // so the closure is safe to call standalone in a future refactor.
      /* v8 ignore next */
      if (!children) return null

      // if children is Array
      if (Array.isArray(children)) {
        return children.map((item, i) => renderChild(item, children.length, i))
      }

      // if children is Fragment — check VNode type
      if (
        typeof children === 'object' &&
        'type' in (children as VNode) &&
        (children as VNode).type === Fragment
      ) {
        const fragmentChildren = (children as VNode).children as VNodeChild[]
        const childrenLength = fragmentChildren.length

        return fragmentChildren.map((item, i) => renderChild(item, childrenLength, i))
      }

      // if single child
      return renderChild(children)
    }

    // --------------------------------------------------------
    // render array of strings or numbers
    // --------------------------------------------------------
    const renderSimpleArray = (simpleData: SimpleValue[]) => {
      const { length } = simpleData

      // Defensive: `renderSimpleArray` is only reached via `renderItems` when
      // `classifyData` returned `{ type: 'simple', data }`, and classifyData
      // returns `null` (never a typed result) for empty input — so `length` is
      // always > 0 here and this guard is unreachable via the public API.
      /* v8 ignore next */
      if (length === 0) return null

      return simpleData.map((item, i) => {
        const key = getKey(item, i)
        const keyName = valueName ?? 'children'
        const extendedProps = attachItemProps({
          i,
          length,
        })

        const finalItemProps = {
          ...(itemProps ? injectItemProps({ [keyName]: item }, extendedProps) : {}),
          [keyName]: item,
        }

        if (Wrapper) {
          const finalWrapProps = wrapProps
            ? injectWrapItemProps({ [keyName]: item }, extendedProps)
            : {}

          // No vnode `key` — see renderChild's note (keyed reuse = frozen rows
          // under the reactive path; whole-list replacement is correct).
          return <Wrapper {...finalWrapProps}>{render(component, finalItemProps)}</Wrapper>
        }

        return render(component, { key, ...finalItemProps })
      })
    }

    // --------------------------------------------------------
    // render array of objects
    // --------------------------------------------------------
    const getObjectKey = (item: ObjectValue, index: number) => {
      if (!itemKey) return item.key ?? item.id ?? item.itemId ?? index
      if (typeof itemKey === 'function') return itemKey(item, index)
      if (typeof itemKey === 'string') return item[itemKey]

      return index
    }

    const renderComplexArray = (complexData: ObjectValue[]) => {
      const { length } = complexData

      // Defensive: same contract as renderSimpleArray — only reached when
      // classifyData returned `{ type: 'complex', data }`, which is impossible
      // for empty input (classifyData returns null), so `length` is always > 0.
      /* v8 ignore next */
      if (length === 0) return null

      return complexData.map((item, i) => {
        const { component: itemComponent, ...restItem } = item
        const renderItem = itemComponent ?? component
        const key = getObjectKey(restItem, i)
        const extendedProps = attachItemProps({
          i,
          length,
        })

        const finalItemProps = {
          ...(itemProps ? injectItemProps(item, extendedProps) : {}),
          ...restItem,
        }

        if (Wrapper && !itemComponent) {
          const finalWrapProps = wrapProps ? injectWrapItemProps(item, extendedProps) : {}

          // No vnode `key` — see renderChild's note (keyed reuse = frozen rows
          // under the reactive path; whole-list replacement is correct).
          return <Wrapper {...finalWrapProps}>{render(renderItem, finalItemProps)}</Wrapper>
        }

        return render(renderItem, { key, ...finalItemProps })
      })
    }

    // --------------------------------------------------------
    // render list items
    // --------------------------------------------------------
    const renderItems = (): VNodeChild => {
      // children have priority over props component + data
      if (children) return renderChildren() as VNodeChild

      // render props component + data
      if (component && Array.isArray(data)) {
        const classified = classifyData(data)
        if (!classified) return null
        if (classified.type === 'simple') return renderSimpleArray(classified.data) as VNodeChild
        return renderComplexArray(classified.data) as VNodeChild
      }

      return null
    }

    return renderItems()
  }

  return reactive ? () => renderBody() : renderBody()
}

// ---------------------------------------------------------------------------
// Public callable type — overloads expose the generic `<T>` API at the JSX
// boundary while the impl stays loose-typed. TS picks the matching overload
// based on the props object passed:
//
//   <Iterator data={['a','b']} valueName="text" component={Item} />
//   ^ T inferred as string → SimpleProps<string> overload selected
//
//   <Iterator data={users} component={UserCard} />
//   ^ T inferred as User → ObjectProps<User> overload selected
//
//   <Iterator>{...}</Iterator>            → ChildrenProps overload selected
// ---------------------------------------------------------------------------
export interface IteratorComponent {
  // T is inferred from the `data` prop at the JSX site — no explicit
  // generic argument needed. Order matters: SimpleProps first (matches
  // `data: SimpleValue[]`), then ObjectProps (object[]), then ChildrenProps,
  // then a LooseProps fallback.
  //
  // The narrow overloads (Simple / Object / Children) drive per-mode T
  // inference and stricter compile-time errors for direct callers (e.g.
  // `valueName` required for primitive arrays, forbidden for object arrays).
  // The LooseProps fallback exists for forwarding patterns where the props
  // type is a wide union that doesn't bind to any single narrow overload —
  // notably `Partial<(typeof Wrapper)['$$types']>` spread back into the JSX
  // site after `@pyreon/rocketstyle`'s 4-overload-aware `ExtractProps`
  // distributes the union across all of Iterator's call signatures. Without
  // the loose binding home, the wide union has nowhere to land and TS
  // reports "no overload matches this call" at every forwarding site.
  //
  // Direct callers still see the strict per-mode errors — the loose fallback
  // only fires when none of the three narrow overloads match.
  <T extends SimpleValue>(props: SimpleProps<T>): VNodeChild
  <T extends ObjectValue>(props: ObjectProps<T>): VNodeChild
  (props: ChildrenProps): VNodeChild
  (props: LooseProps): VNodeChild
  isIterator: true
  RESERVED_PROPS: typeof RESERVED_PROPS
  displayName?: string
}

const Iterator = Object.assign(Component, {
  isIterator: true as const,
  RESERVED_PROPS,
}) as unknown as IteratorComponent

export default Iterator
