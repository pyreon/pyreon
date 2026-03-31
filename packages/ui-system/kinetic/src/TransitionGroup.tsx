import type { VNode } from '@pyreon/core'
import { splitProps } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import Transition from './Transition'
import type { ClassTransitionProps, StyleTransitionProps, TransitionCallbacks } from './types'

export type TransitionGroupProps = ClassTransitionProps &
  StyleTransitionProps &
  TransitionCallbacks & {
    appear?: boolean | undefined
    timeout?: number | undefined
    /**
     * Children can be a static array OR a reactive accessor `() => VNode[]`.
     * When passed as an accessor, TransitionGroup tracks changes and
     * animates entering/leaving children automatically.
     */
    children: VNode[] | (() => VNode[])
  }

type KeyedChild = { key: string | number; element: VNode }

const isVNode = (child: unknown): child is VNode =>
  child != null && typeof child === 'object' && 'type' in (child as object)

const getKeyedChildren = (children: VNode[]): KeyedChild[] => {
  const result: KeyedChild[] = []
  for (const child of children) {
    if (isVNode(child)) {
      const key = (child as VNode & { key?: string | number }).key
      if (key != null) {
        result.push({ key, element: child })
      }
    }
  }
  return result
}

/**
 * Renders children with key-based enter/exit animations.
 *
 * In Pyreon, components run once. For TransitionGroup to detect children
 * changes, pass children as a reactive accessor: `() => VNode[]`.
 * The component uses a reactive accessor internally to diff previous vs
 * current children and animate entries/exits.
 */
const TransitionGroup = (props: TransitionGroupProps): VNode | null => {
  const [own, transitionProps] = splitProps(props, [
    'children',
    'appear',
    'timeout',
    'onAfterLeave',
  ])
  const appear = own.appear ?? false
  const prevMap = new Map<string | number, VNode>()
  const leavingMap = new Map<string | number, VNode>()
  const forceUpdate = signal(0)

  // Normalize children to an accessor for uniform handling
  const getChildren =
    typeof own.children === 'function' ? (own.children as () => VNode[]) : () => own.children

  // Track initial keys for appear animation logic
  const initialKeyed = getKeyedChildren(getChildren())
  const initialKeys = new Set(initialKeyed.map((c) => c.key))
  for (const { key, element } of initialKeyed) {
    prevMap.set(key, element)
  }

  const handleAfterLeave = (key: string | number) => {
    leavingMap.delete(key)
    own.onAfterLeave?.()
    forceUpdate.update((c) => c + 1)
  }

  // Reactive accessor — re-evaluates when children() or forceUpdate changes.
  // The runtime mounts this via mountReactive + effect, creating a
  // reactive scope that tracks signal reads.
  return (() => {
    // Read forceUpdate to re-evaluate when leaving children finish
    forceUpdate()

    const currentChildren = getChildren()
    const currentKeyed = getKeyedChildren(currentChildren)
    const currentMap = new Map<string | number, VNode>()
    for (const { key, element } of currentKeyed) {
      currentMap.set(key, element)
    }

    // Detect leaving children (were in prev but not in current)
    for (const [key, child] of prevMap) {
      if (!currentMap.has(key) && !leavingMap.has(key)) {
        leavingMap.set(key, child)
      }
    }

    // If a leaving child reappears, cancel the leave
    for (const key of currentMap.keys()) {
      leavingMap.delete(key)
    }

    // Update prev for next diff
    prevMap.clear()
    for (const [key, element] of currentMap) {
      prevMap.set(key, element)
    }

    // Merge current + leaving, preserving insertion order
    const allEntries: KeyedChild[] = [...currentKeyed]
    for (const [key, element] of leavingMap) {
      allEntries.push({ key, element })
    }

    return (
      <>
        {allEntries.map(({ key, element }) => {
          const isInitial = initialKeys.has(key)
          const isShowing = currentMap.has(key)

          return (
            <Transition
              key={key}
              show={() => isShowing}
              appear={isInitial ? appear : true}
              timeout={own.timeout}
              {...transitionProps}
              onAfterLeave={() => handleAfterLeave(key)}
            >
              {element}
            </Transition>
          )
        })}
      </>
    )
  }) as unknown as VNode
}

export default TransitionGroup
