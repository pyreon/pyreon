import type { ComponentFn, VNode } from '@pyreon/core'
import { h, pushContext } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { createHeadContext, HeadContext } from './context'
import { serializeHead } from './serialize'

export { serializeHead } from './serialize'

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

export interface RenderWithHeadOptions {
  /**
   * CSP nonce for the current request. Stamped onto every inline `<script>` /
   * `<style>` tag head emits, so a strict `script-src`/`style-src 'nonce-…'`
   * policy admits them. Pass the per-request value (`useRequestLocals().cspNonce`);
   * omit for SSG / no-CSP (no attribute is added). A user-supplied `nonce` on a
   * specific tag wins — this only fills tags that don't already carry one.
   */
  nonce?: string | undefined
}

export async function renderWithHead(
  app: VNode,
  options?: RenderWithHeadOptions,
): Promise<RenderWithHeadResult> {
  const ctx = createHeadContext()

  // HeadInjector runs inside renderToString's ALS scope, so pushContext reaches
  // the per-request context stack rather than the module-level fallback stack.
  function HeadInjector(): VNode {
    pushContext(new Map([[HeadContext.id, ctx]]))
    return app
  }

  const html = await renderToString(h(HeadInjector as ComponentFn, null))
  const titleTemplate = ctx.resolveTitleTemplate()
  const head = serializeHead(ctx.resolve(), titleTemplate, options?.nonce)
  return {
    html,
    head,
    htmlAttrs: ctx.resolveHtmlAttrs(),
    bodyAttrs: ctx.resolveBodyAttrs(),
  }
}
