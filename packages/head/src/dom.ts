import type { HeadContextValue } from "./context"

const ATTR = "data-pyreon-head"

/**
 * Sync the resolved head tags to the real DOM <head>.
 * Uses incremental diffing: matches existing elements by key, patches attributes
 * in-place, adds new elements, and removes stale ones.
 * Also syncs htmlAttrs, bodyAttrs, and applies titleTemplate.
 * No-op on the server (typeof document === "undefined").
 */
export function syncDom(ctx: HeadContextValue): void {
  if (typeof document === "undefined") return

  const tags = ctx.resolve()
  const titleTemplate = ctx.resolveTitleTemplate()
  const existing = document.head.querySelectorAll(`[${ATTR}]`)
  const byKey = new Map<string, Element>()
  for (const el of existing) {
    // ATTR is always set (we selected [${ATTR}]), so getAttribute always returns string.
    // Key is always non-empty because we set it from tag.key which is always truthy.
    byKey.set(el.getAttribute(ATTR) as string, el)
  }

  const kept = new Set<Element>()

  for (const tag of tags) {
    if (tag.tag === "title") {
      document.title = applyTitleTemplate(String(tag.children), titleTemplate)
      continue
    }

    const key = tag.key as string
    const found = byKey.get(key)

    if (found && found.tagName.toLowerCase() === tag.tag) {
      kept.add(found)
      patchAttrs(found, tag.props as Record<string, string>)
      const content = String(tag.children)
      if (found.textContent !== content) found.textContent = content
    } else {
      const el = document.createElement(tag.tag)
      el.setAttribute(ATTR, key)
      for (const [k, v] of Object.entries(tag.props as Record<string, string>)) {
        el.setAttribute(k, v)
      }
      if (tag.children) el.textContent = tag.children
      document.head.appendChild(el)
    }
  }

  // Remove stale elements
  for (const el of existing) {
    if (!kept.has(el)) el.remove()
  }

  // Sync html/body attributes
  syncElementAttrs(document.documentElement, ctx.resolveHtmlAttrs())
  syncElementAttrs(document.body, ctx.resolveBodyAttrs())
}

/** Patch an element's attributes to match the desired props. */
function patchAttrs(el: Element, props: Record<string, string>): void {
  for (let i = el.attributes.length - 1; i >= 0; i--) {
    const attr = el.attributes[i]
    if (!attr || attr.name === ATTR) continue
    if (!(attr.name in props)) el.removeAttribute(attr.name)
  }
  for (const [k, v] of Object.entries(props)) {
    if (el.getAttribute(k) !== v) el.setAttribute(k, v)
  }
}

function applyTitleTemplate(
  title: string,
  template: string | ((title: string) => string) | undefined,
): string {
  if (!template) return title
  if (typeof template === "function") return template(title)
  return template.replace(/%s/g, title)
}

/** Sync pyreon-managed attributes on <html> or <body>. */
function syncElementAttrs(el: Element, attrs: Record<string, string>): void {
  // Remove previously managed attrs that are no longer present
  const managed = el.getAttribute(`${ATTR}-attrs`)
  if (managed) {
    for (const name of managed.split(",")) {
      if (name && !(name in attrs)) el.removeAttribute(name)
    }
  }
  const keys: string[] = []
  for (const [k, v] of Object.entries(attrs)) {
    keys.push(k)
    if (el.getAttribute(k) !== v) el.setAttribute(k, v)
  }
  if (keys.length > 0) {
    el.setAttribute(`${ATTR}-attrs`, keys.join(","))
  } else if (managed) {
    el.removeAttribute(`${ATTR}-attrs`)
  }
}
