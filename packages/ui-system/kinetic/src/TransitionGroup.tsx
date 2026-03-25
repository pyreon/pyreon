import type { VNode } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"
import Transition from "./Transition"
import type { ClassTransitionProps, StyleTransitionProps, TransitionCallbacks } from "./types"

export type TransitionGroupProps = ClassTransitionProps &
  StyleTransitionProps &
  TransitionCallbacks & {
    appear?: boolean | undefined
    timeout?: number | undefined
    children: VNode[]
  }

type KeyedChild = { key: string | number; element: VNode }

const isVNode = (child: unknown): child is VNode =>
  child != null && typeof child === "object" && "type" in (child as object)

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

const TransitionGroup = ({
  children,
  appear = false,
  timeout,
  onAfterLeave,
  ...transitionProps
}: TransitionGroupProps): VNode | null => {
  const prevMap = new Map<string | number, VNode>()
  const leavingMap = new Map<string | number, VNode>()
  const forceUpdateSignal = signal(0)

  // Build current keyed children map
  const currentKeyed = getKeyedChildren(children)
  const currentMap = new Map<string | number, VNode>()
  for (const { key, element } of currentKeyed) {
    currentMap.set(key, element)
  }

  // Track initial keys to know which children were present on first render
  const initialKeys: Set<string | number> = new Set(currentMap.keys())

  // Detect leaving children (were in prev but not in current)
  for (const [key, child] of prevMap) {
    if (!currentMap.has(key)) {
      leavingMap.set(key, child)
    }
  }

  // If a leaving child reappears, stop leaving
  for (const key of currentMap.keys()) {
    leavingMap.delete(key)
  }

  // Update prev
  prevMap.clear()
  for (const [key, element] of currentMap) {
    prevMap.set(key, element)
  }

  const handleAfterLeave = (key: string | number) => {
    leavingMap.delete(key)
    onAfterLeave?.()
    forceUpdateSignal.update((c) => c + 1)
  }

  // Merge current + leaving, preserving insertion order
  const allEntries: KeyedChild[] = [...currentKeyed]

  for (const [key, element] of leavingMap) {
    allEntries.push({ key, element })
  }

  return (
    <>
      {allEntries.map(({ key, element }) => {
        // New children (not in initial render) must appear with animation
        const isInitial = initialKeys.has(key)
        const isShowing = currentMap.has(key)

        return (
          <Transition
            key={key}
            show={() => isShowing}
            appear={isInitial ? appear : true}
            timeout={timeout}
            {...transitionProps}
            onAfterLeave={() => handleAfterLeave(key)}
          >
            {element}
          </Transition>
        )
      })}
    </>
  )
}

export default TransitionGroup
