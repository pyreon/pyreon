import type { ComponentFn, Props, VNodeChild } from "@pyreon/core"
import { onUnmount, popContext, pushContext } from "@pyreon/core"
import type { HeadContextValue } from "./context"
import { HeadContext } from "./context"

export interface HeadProviderProps extends Props {
  context: HeadContextValue
  children?: VNodeChild
}

/**
 * Provides a HeadContextValue to all descendant components.
 * Wrap your app root with this to enable useHead() throughout the tree.
 *
 * @example
 * const headCtx = createHeadContext()
 * mount(
 *   h(HeadProvider, { context: headCtx },
 *     h(App, null)
 *   ),
 *   document.getElementById("app")!
 * )
 */
export const HeadProvider: ComponentFn<HeadProviderProps> = (props) => {
  // Push context frame synchronously (before children mount) so all descendants
  // can read HeadContext via useContext(). Pop on unmount for correct cleanup.
  const frame = new Map([[HeadContext.id, props.context]])
  pushContext(frame)
  onUnmount(() => popContext())

  const ch = props.children
  return (typeof ch === "function" ? (ch as () => VNodeChild)() : ch) as ReturnType<ComponentFn>
}
