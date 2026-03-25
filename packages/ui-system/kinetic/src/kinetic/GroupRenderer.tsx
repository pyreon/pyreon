import type { VNode } from "@pyreon/core"
import { h } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"
import type { TransitionCallbacks } from "../types"
import TransitionItem from "./TransitionItem"
import type { KineticConfig } from "./types"

type GroupRendererProps = {
  config: KineticConfig
  htmlProps: Record<string, unknown>
  appear?: boolean | undefined
  timeout?: number | undefined
  callbacks: Partial<TransitionCallbacks>
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

/**
 * Renders children with key-based enter/exit animation (no `show` prop).
 * Children that appear (new key) animate in. Children that disappear
 * (removed key) stay in DOM during leave animation, then unmount.
 * config.tag wraps all children as a container element.
 */
const GroupRenderer = ({
  config,
  htmlProps,
  appear,
  timeout,
  callbacks,
  children,
}: GroupRendererProps): VNode | null => {
  const effectiveAppear = appear ?? config.appear ?? false
  const effectiveTimeout = timeout ?? config.timeout ?? 5000

  const prevMap = new Map<string | number, VNode>()
  const leavingMap = new Map<string | number, VNode>()
  const forceUpdateSignal = signal(0)

  const currentKeyed = getKeyedChildren(children)
  const currentMap = new Map<string | number, VNode>()
  for (const { key, element } of currentKeyed) {
    currentMap.set(key, element)
  }

  const initialKeys: Set<string | number> = new Set(currentMap.keys())

  // Detect leaving children
  for (const [key, child] of prevMap) {
    if (!currentMap.has(key)) {
      leavingMap.set(key, child)
    }
  }

  // If a leaving child reappears, stop leaving
  for (const key of currentMap.keys()) {
    leavingMap.delete(key)
  }

  prevMap.clear()
  for (const [key, element] of currentMap) {
    prevMap.set(key, element)
  }

  const handleAfterLeave = (key: string | number) => {
    leavingMap.delete(key)
    callbacks.onAfterLeave?.()
    forceUpdateSignal.update((c) => c + 1)
  }

  // Merge current + leaving
  const allEntries: KeyedChild[] = [...currentKeyed]
  for (const [key, element] of leavingMap) {
    allEntries.push({ key, element })
  }

  const groupedChildren = allEntries.map(({ key, element }) => {
    const isInitial = initialKeys.has(key)
    const isShowing = currentMap.has(key)

    return (
      <TransitionItem
        show={() => isShowing}
        appear={isInitial ? effectiveAppear : true}
        timeout={effectiveTimeout}
        enterStyle={config.enterStyle}
        enterToStyle={config.enterToStyle}
        enterTransition={config.enterTransition}
        leaveStyle={config.leaveStyle}
        leaveToStyle={config.leaveToStyle}
        leaveTransition={config.leaveTransition}
        enter={config.enter}
        enterFrom={config.enterFrom}
        enterTo={config.enterTo}
        leave={config.leave}
        leaveFrom={config.leaveFrom}
        leaveTo={config.leaveTo}
        onAfterLeave={() => handleAfterLeave(key)}
      >
        {element}
      </TransitionItem>
    )
  })

  return h(config.tag, { ...htmlProps }, ...groupedChildren)
}

export default GroupRenderer
