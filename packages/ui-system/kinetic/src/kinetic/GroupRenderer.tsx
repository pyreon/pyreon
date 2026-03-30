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
  /**
   * Children can be a static array OR a reactive accessor `() => VNode[]`.
   * When passed as an accessor, GroupRenderer tracks changes and
   * animates entering/leaving children automatically.
   */
  children: VNode[] | (() => VNode[])
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
 *
 * In Pyreon, components run once. Pass children as a reactive accessor
 * `() => VNode[]` for the group to detect changes and animate entries/exits.
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
  const forceUpdate = signal(0)

  // Normalize children to an accessor
  const getChildren = typeof children === "function" ? (children as () => VNode[]) : () => children

  // Track initial keys for appear animation logic
  const initialKeyed = getKeyedChildren(getChildren())
  const initialKeys = new Set(initialKeyed.map((c) => c.key))
  for (const { key, element } of initialKeyed) {
    prevMap.set(key, element)
  }

  const handleAfterLeave = (key: string | number) => {
    leavingMap.delete(key)
    callbacks.onAfterLeave?.()
    forceUpdate.update((c) => c + 1)
  }

  // Reactive accessor — re-evaluates when children() or forceUpdate changes
  return (() => {
    forceUpdate()

    const currentChildren = getChildren()
    const currentKeyed = getKeyedChildren(currentChildren)
    const currentMap = new Map<string | number, VNode>()
    for (const { key, element } of currentKeyed) {
      currentMap.set(key, element)
    }

    // Detect leaving children
    for (const [key, child] of prevMap) {
      if (!currentMap.has(key) && !leavingMap.has(key)) {
        leavingMap.set(key, child)
      }
    }

    // Cancel leave if child reappears
    for (const key of currentMap.keys()) {
      leavingMap.delete(key)
    }

    // Update prev for next diff
    prevMap.clear()
    for (const [key, element] of currentMap) {
      prevMap.set(key, element)
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
  }) as unknown as VNode
}

export default GroupRenderer
