import { h, pushContext } from "@pyreon/core"
import type { ComponentFn, VNode } from "@pyreon/core"
import { renderToString } from "@pyreon/runtime-server"
import { HeadContext, createHeadContext } from "./context"
import type { HeadTag } from "./context"

const VOID_TAGS = new Set(["meta", "link", "base"])

/**
 * Render a Pyreon app to an HTML fragment + a serialized <head> string.
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
export interface RenderWithHeadResult {
  html: string
  head: string
  /** Attributes to set on the <html> element */
  htmlAttrs: Record<string, string>
  /** Attributes to set on the <body> element */
  bodyAttrs: Record<string, string>
}

export async function renderWithHead(app: VNode): Promise<RenderWithHeadResult> {
  const ctx = createHeadContext()

  // HeadInjector runs inside renderToString's ALS scope, so pushContext reaches
  // the per-request context stack rather than the module-level fallback stack.
  function HeadInjector(): VNode {
    pushContext(new Map([[HeadContext.id, ctx]]))
    return app
  }

  const html = await renderToString(h(HeadInjector as ComponentFn, null))
  const titleTemplate = ctx.resolveTitleTemplate()
  const head = ctx.resolve().map((tag) => serializeTag(tag, titleTemplate)).join("\n  ")
  return {
    html,
    head,
    htmlAttrs: ctx.resolveHtmlAttrs(),
    bodyAttrs: ctx.resolveBodyAttrs(),
  }
}

function serializeTag(
  tag: HeadTag,
  titleTemplate?: string | ((title: string) => string),
): string {
  if (tag.tag === "title") {
    const raw = tag.children ?? ""
    const title = titleTemplate
      ? typeof titleTemplate === "function" ? titleTemplate(raw) : titleTemplate.replace(/%s/g, raw)
      : raw
    return `<title>${esc(title)}</title>`
  }
  const attrs = Object.entries(tag.props ?? {})
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(" ")
  const open = attrs ? `<${tag.tag} ${attrs}` : `<${tag.tag}`
  if (VOID_TAGS.has(tag.tag)) return `${open} />`
  // Script/style/noscript content is raw — only escape closing tags
  const isRaw = tag.tag === "script" || tag.tag === "style" || tag.tag === "noscript"
  const content = tag.children ?? ""
  const body = isRaw ? content.replace(/<\/(script|style|noscript)/gi, "<\\/$1") : esc(content)
  return `${open}>${body}</${tag.tag}>`
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
