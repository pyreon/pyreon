// @pyreon/runtime-dom — surgical signal-to-DOM renderer (no virtual DOM)

export type { DevtoolsComponentEntry, PyreonDevtools } from "./devtools"
export { hydrateRoot } from "./hydrate"
export { disableHydrationWarnings, enableHydrationWarnings } from "./hydration-debug"
export type { KeepAliveProps } from "./keep-alive"
export { KeepAlive } from "./keep-alive"
export { mountChild } from "./mount"
export type { Directive, SanitizeFn } from "./props"
export { applyProp, applyProps, sanitizeHtml, setSanitizer } from "./props"
export { createTemplate } from "./template"
export type { TransitionProps } from "./transition"
export { Transition } from "./transition"
export type { TransitionGroupProps } from "./transition-group"
export { TransitionGroup } from "./transition-group"

import type { VNodeChild } from "@pyreon/core"
import { installDevTools } from "./devtools"
import { mountChild } from "./mount"

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
