// @pyreon/runtime-dom — surgical signal-to-DOM renderer (no virtual DOM)

export { mountChild } from "./mount"
export type { DevtoolsComponentEntry, PyreonDevtools } from "./devtools"
export { applyProp, applyProps, sanitizeHtml, setSanitizer } from "./props"
export type { Directive, SanitizeFn } from "./props"
export { createTemplate } from "./template"
export { hydrateRoot } from "./hydrate"
export { enableHydrationWarnings, disableHydrationWarnings } from "./hydration-debug"
export { Transition } from "./transition"
export type { TransitionProps } from "./transition"
export { TransitionGroup } from "./transition-group"
export type { TransitionGroupProps } from "./transition-group"
export { KeepAlive } from "./keep-alive"
export type { KeepAliveProps } from "./keep-alive"

import type { VNodeChild } from "@pyreon/core"
import { mountChild } from "./mount"
import { installDevTools } from "./devtools"

/**
 * Mount a VNode tree into a container element.
 * Clears the container first, then mounts the given child.
 * Returns an `unmount` function that removes everything and disposes effects.
 *
 * @example
 * const unmount = mount(h("div", null, "Hello Pyreon"), document.getElementById("app")!)
 */
export function mount(root: VNodeChild, container: Element): () => void {
  installDevTools()
  container.innerHTML = ""
  return mountChild(root, container, null)
}

/** Alias for `mount` */
export const render = mount
