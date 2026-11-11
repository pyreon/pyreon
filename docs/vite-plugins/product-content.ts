import { createHighlighter, type Highlighter } from 'shiki'
import type { Plugin } from 'vite'
import { pyreonSyntaxDark, pyreonSyntaxLight } from '../src/styles/pyreon-syntax'

/**
 * Highlights the code in product content files at BUILD time, so no
 * highlighter ships to the browser.
 *
 * Every `src/site/content/products/<id>.json` import (not `_index.json`) is
 * rewritten before Vite's JSON plugin sees it: each code string the product
 * template renders gets a sibling `…Html` field holding Shiki's output for
 * both themes (`defaultColor: false` → per-token `--shiki-light` /
 * `--shiki-dark` variables, which `CodeCard` / `CodeDiff` pick between with
 * `[data-theme]`). The original strings stay, for copy buttons and tests.
 *
 *   difference.before.code  → difference.before.codeHtml
 *   difference.after.code   → difference.after.codeHtml
 *   comingFrom[].before/after → beforeHtml / afterHtml
 *   recipes[].code          → codeHtml
 *
 * The output is the content set's own JSON, so it is trusted markup.
 */
const PRODUCT_JSON = /\/src\/site\/content\/products\/(?!_)[a-z0-9-]+\.json$/

let highlighter: Promise<Highlighter> | null = null
function getHighlighter(): Promise<Highlighter> {
  highlighter ??= createHighlighter({
    themes: [pyreonSyntaxLight as never, pyreonSyntaxDark as never],
    langs: ['tsx', 'typescript', 'bash', 'json'],
  })
  return highlighter
}

/** Shiki HTML for both themes, as CSS variables (no inline default colour). */
export async function highlight(code: string, lang = 'tsx'): Promise<string> {
  const hl = await getHighlighter()
  return hl.codeToHtml(code, {
    lang,
    themes: { light: pyreonSyntaxLight.name, dark: pyreonSyntaxDark.name },
    defaultColor: false,
  })
}

type Json = Record<string, unknown>

/** Adds the `…Html` siblings to a parsed product file. Exported for tests. */
export async function highlightProduct(data: Json): Promise<Json> {
  const diff = data.difference as { before?: Json; after?: Json } | null | undefined
  if (diff) {
    for (const side of [diff.before, diff.after]) {
      if (side && typeof side.code === 'string') side.codeHtml = await highlight(side.code)
    }
  }
  if (Array.isArray(data.comingFrom)) {
    for (const c of data.comingFrom as Json[]) {
      if (typeof c.before === 'string') c.beforeHtml = await highlight(c.before)
      if (typeof c.after === 'string') c.afterHtml = await highlight(c.after)
    }
  }
  if (Array.isArray(data.recipes)) {
    for (const r of data.recipes as Json[]) {
      if (typeof r.code === 'string') r.codeHtml = await highlight(r.code)
    }
  }
  return data
}

export default function productContent(): Plugin {
  return {
    name: 'pyreon-docs-product-content',
    enforce: 'pre',
    async transform(code, id) {
      const path = id.split('?')[0] ?? id
      if (!PRODUCT_JSON.test(path)) return null
      let data: Json
      try {
        data = JSON.parse(code) as Json
      } catch (err) {
        throw new Error(`[Pyreon] product content ${path} is not valid JSON: ${(err as Error).message}`)
      }
      return { code: JSON.stringify(await highlightProduct(data)), map: null }
    },
  }
}
