import type { ComponentFn, Props, VNodeChild } from "@pyreon/core"
import { provide } from "@pyreon/core"
import type { HeadContextValue } from "./context"
import { createHeadContext, HeadContext } from "./context"

export interface HeadProviderProps extends Props {
  context?: HeadContextValue | undefined
  children?: VNodeChild
}

/**
 * Provides a HeadContextValue to all descendant components.
 * Wrap your app root with this to enable useHead() throughout the tree.
 *
 * If no `context` prop is passed, a new HeadContext is created automatically.
 *
 * @example
 * // Auto-create context:
 * <HeadProvider><App /></HeadProvider>
 *
 * // Explicit context (e.g. for SSR):
 * const headCtx = createHeadContext()
 * mount(h(HeadProvider, { context: headCtx }, h(App, null)), root)
 */
export const HeadProvider: ComponentFn<HeadProviderProps> = (props) => {
  const ctx = props.context ?? createHeadContext()
  provide(HeadContext, ctx)

  const ch = props.children
  return typeof ch === "function" ? (ch as () => VNodeChild)() : ch
}
