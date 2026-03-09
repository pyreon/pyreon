import { h, pushContext } from "@pyreon/core"
import type { ComponentFn, VNode } from "@pyreon/core"
import { renderToString } from "@pyreon/runtime-server"
import { HeadContext, createHeadContext } from "./context"
import type { HeadTag } from "./context"

const VOID_TAGS = new Set(["meta", "link", "base"])

/**
 * Render a Nova app to an HTML fragment + a serialized <head> string.
 *
 * The returned `head` string can be injected directly into your HTML template:
 *
 * @example
 * const { html, head } = await renderWithHead(h(App, null))
 * const page = `<!DOCTYPE html>
 * <html>
 *   <head>
 *     <meta charset="UTF-8" />
 *     ${head}
 *   </head>
 *   <body><div id="app">${html}</div></body>
 * </html>`
 */
export async function renderWithHead(app: VNode): Promise<{ html: string; head: string }> {
  const ctx = createHeadContext()

  // HeadInjector runs inside renderToString's ALS scope, so pushContext reaches
  // the per-request context stack rather than the module-level fallback stack.
  function HeadInjector(): VNode {
    pushContext(new Map([[HeadContext.id, ctx]]))
    return app
  }

  const html = await renderToString(h(HeadInjector as ComponentFn, null))
  const head = ctx.resolve().map(serializeTag).join("\n  ")
  return { html, head }
}

function serializeTag(tag: HeadTag): string {
  if (tag.tag === "title") {
    return `<title>${esc(tag.children ?? "")}</title>`
  }
  const attrs = Object.entries(tag.props ?? {})
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(" ")
  const open = attrs ? `<${tag.tag} ${attrs}` : `<${tag.tag}`
  if (VOID_TAGS.has(tag.tag)) return `${open} />`
  return `${open}>${esc(tag.children ?? "")}</${tag.tag}>`
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
