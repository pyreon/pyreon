import type { HeadContextValue } from "./context"

const ATTR = "data-nova-head"

/**
 * Sync the resolved head tags to the real DOM <head>.
 * Removes all previously injected nova-head tags, then re-inserts the current set.
 * No-op on the server (typeof document === "undefined").
 */
export function syncDom(ctx: HeadContextValue): void {
  if (typeof document === "undefined") return

  // Remove previously injected tags (leave manually authored tags alone)
  document.head.querySelectorAll(`[${ATTR}]`).forEach((el) => el.remove())

  for (const tag of ctx.resolve()) {
    if (tag.tag === "title") {
      document.title = tag.children ?? ""
      continue
    }
    const el = document.createElement(tag.tag)
    el.setAttribute(ATTR, "true")
    for (const [k, v] of Object.entries(tag.props ?? {})) {
      el.setAttribute(k, v)
    }
    if (tag.children) el.textContent = tag.children
    document.head.appendChild(el)
  }
}
